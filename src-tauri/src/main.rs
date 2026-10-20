#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::HashMap, io::{BufRead, BufReader, Write}, process::{Child, ChildStdin, Command, Stdio}, sync::{Arc, Mutex, atomic::{AtomicU64, Ordering}}, time::Duration};
use serde_json::Value;
use tauri::{Emitter, Manager};
use tokio::sync::oneshot;

type Reply = Result<Value, String>;
// Windows 资源路径可能带扩展命名空间；Node 的入口解析需要普通盘符路径。
fn node_path(path: &std::path::Path) -> std::path::PathBuf {
    #[cfg(windows)] {
        let text=path.to_string_lossy();
        if let Some(value)=text.strip_prefix(r"\\?\") {return std::path::PathBuf::from(value);}
    }
    path.to_path_buf()
}
struct Worker {
    child: Mutex<Child>,
    input: Mutex<ChildStdin>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Reply>>>>,
    next: AtomicU64,
}

#[tauri::command]
async fn rpc(state: tauri::State<'_, Worker>, method: String, args: Vec<Value>) -> Reply {
    const METHODS: &[&str] = &["discover","recent","connect","albums","photos","import","importStatus","thumbnail","preview","enqueue","enqueueBatch","cancel","manage","addToAlbum","jobs","storage","loadDraft","saveDraft","estimate","duplicateMatches"];
    if !METHODS.contains(&method.as_str()) { return Err("不支持的操作".into()); }
    let id = state.next.fetch_add(1, Ordering::Relaxed);
    let (sender, receiver) = oneshot::channel();
    state.pending.lock().map_err(|e| e.to_string())?.insert(id,sender);
    let line = serde_json::json!({"id":id,"method":method,"args":args}).to_string()+"\n";
    if let Err(error) = state.input.lock().map_err(|e|e.to_string())?.write_all(line.as_bytes()) {
        state.pending.lock().unwrap().remove(&id);
        return Err(error.to_string());
    }
    // 上传任务异步排队；原文件下载/探测允许较长时间，UI 始终可响应。
    match tokio::time::timeout(Duration::from_secs(600), receiver).await {
        Ok(Ok(reply)) => reply,
        _ => {state.pending.lock().unwrap().remove(&id);Err("本地媒体服务响应超时，请刷新后核对操作结果".into())}
    }
}

fn main() {
    let mut context = tauri::generate_context!();
    if cfg!(debug_assertions) && std::env::var("TIMESFRAME_UI_TEST").as_deref() == Ok("1") {
        context.config_mut().app.windows[0].additional_browser_args = Some("--remote-debugging-port=9224".into());
        context.config_mut().app.windows[0].data_directory = Some(std::path::PathBuf::from(format!("ui-test-{}",std::process::id())));
        #[cfg(windows)]
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER",std::env::temp_dir().join(format!("divoom-album-webview-{}",std::process::id())));
    }
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let resource = app.path().resource_dir()?;
            let data = app.path().app_data_dir()?;
            let data = if cfg!(debug_assertions) && std::env::var("TIMESFRAME_UI_TEST").as_deref() == Ok("1") {data.join(format!("ui-test-{}",std::process::id()))} else {data};
            std::fs::create_dir_all(&data)?;
            let dev_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
            let script = if resource.join("worker.cjs").exists() {resource.join("worker.cjs")} else {dev_root.join("dist-backend/worker.cjs")};
            let bin = if resource.join("bin").exists() {resource.join("bin")} else {dev_root.join("vendor")};
            let suffix = if cfg!(windows) {".exe"} else {""};
            let installed = std::env::current_exe()?.parent().unwrap().join(format!("timesframe-worker{suffix}"));
            let triple = if cfg!(windows) {"x86_64-pc-windows-msvc"} else if cfg!(target_arch="aarch64") {"aarch64-apple-darwin"} else {"x86_64-apple-darwin"};
            let worker = if installed.exists() {installed} else {dev_root.join(format!("src-tauri/binaries/timesframe-worker-{triple}{suffix}"))};
            let application_logs=std::env::current_exe()?.parent().unwrap().join("logs");
            let open_log=|directory:&std::path::Path| -> std::io::Result<std::fs::File> {
                std::fs::create_dir_all(directory)?;
                let file=directory.join("worker.log");
                if std::fs::metadata(&file).map(|m|m.len()>5*1024*1024).unwrap_or(false) {
                    let _=std::fs::remove_file(directory.join("worker.log.3"));
                    for i in (1..3).rev() {let _=std::fs::rename(directory.join(format!("worker.log.{i}")),directory.join(format!("worker.log.{}",i+1)));}
                    let _=std::fs::rename(&file,directory.join("worker.log.1"));
                }
                std::fs::OpenOptions::new().create(true).append(true).open(file)
            };
            let (log_directory,mut stderr_log)=match open_log(&application_logs) {
                Ok(file)=>(application_logs,file),
                Err(error)=>{let fallback=data.join("logs");let mut file=open_log(&fallback)?;let _=writeln!(file,"Application log directory unavailable: {error}; using {}",fallback.display());(fallback,file)}
            };
            let _=writeln!(stderr_log,"\n[unix {}] Starting media worker: {} | logs: {}",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),worker.display(),log_directory.display());
            let mut native_log=stderr_log.try_clone()?;
            let mut command = Command::new(worker);
            let script=node_path(&script);
            command.current_dir(script.parent().unwrap()).arg(&script).arg(node_path(&data)).arg(node_path(&bin)).arg(node_path(&log_directory)).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::from(stderr_log));
            #[cfg(windows)] {use std::os::windows::process::CommandExt; command.creation_flags(0x08000000);}
            let mut child = command.spawn().map_err(|error| {let _=writeln!(native_log,"Media worker spawn failed: {error}");error})?;
            let input = child.stdin.take().unwrap();
            let output = child.stdout.take().unwrap();
            let pending: Arc<Mutex<HashMap<u64,oneshot::Sender<Reply>>>> = Arc::new(Mutex::new(HashMap::new()));
            let replies = pending.clone();
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                for line in BufReader::new(output).lines().map_while(Result::ok) {
                    let Ok(value) = serde_json::from_str::<Value>(&line) else {continue};
                    if value["event"] == "jobs" { let _ = handle.emit("jobs",&value["data"]); }
                    if let Some(id) = value["id"].as_u64() {
                        if let Some(sender) = replies.lock().unwrap().remove(&id) {
                            let result = if let Some(error)=value["error"].as_str() {Err(error.into())} else {Ok(value["result"].clone())};
                            let _ = sender.send(result);
                        }
                    }
                }
                let _=writeln!(native_log,"Media worker stdout closed; pending requests will fail");
                for (_,sender) in replies.lock().unwrap().drain() {let _=sender.send(Err("本地媒体服务已退出，请重新启动 TimesFrame".into()));}
            });
            app.manage(Worker{child:Mutex::new(child),input:Mutex::new(input),pending,next:AtomicU64::new(1)});
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![rpc])
        .build(context)
        .expect("Divoom 相簿启动失败");
    app.run(|handle,event| {if let tauri::RunEvent::Exit = event {if let Some(worker)=handle.try_state::<Worker>() {
        let _=worker.input.lock().unwrap().write_all(b"{\"method\":\"shutdown\"}\n");
        std::thread::sleep(Duration::from_millis(300));
        let _=worker.child.lock().unwrap().kill();
    }}});
}
