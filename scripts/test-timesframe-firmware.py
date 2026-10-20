"""Compile the actual patched query functions with product cJSON and real SQLite on Windows."""
from pathlib import Path
import hashlib
import argparse
import json
import re
import subprocess
import sys
import time

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root',type=Path,default=Path(r'Z:\allwinner\tina_t113_v5.0\platform\thirdparty\gui\lvgl-8\divoom_app\src'))
parser.add_argument('--output-root',type=Path,default=Path(__file__).resolve().parents[1]/'artifacts/timesframe-firmware')
options=parser.parse_args()
root=options.source_root
out=options.output_root/f'native-{time.time_ns()}'
options.output_root.mkdir(parents=True,exist_ok=True)
if out.exists(): raise RuntimeError('Keep existing native test run')
out.mkdir()
database=(root/'middle/divoom_database_manage.c').read_text(encoding='utf-8')
server=(root/'app/divoom_http_server.c').read_text(encoding='utf-8')
def function(source,name):
    match=re.search(r'(?:static )?divoom_cJSON \*'+name+r'\([^\n]*\)\n\{.*?\n\}',source,re.S)
    if not match: raise RuntimeError(name)
    return match.group(0)

(out/'cJSON.c').write_bytes((root/'middle/cJSON.c').read_bytes())
(out/'cJSON.h').write_bytes((root/'middle/include/cJSON.h').read_bytes())
(out/'divoom.h').write_text('''#include <stdlib.h>
#include <stdint.h>
#define DIVOOM_MODEL_CJSON 1
static __inline void *divoom_malloc(size_t n,int a,int b,const char *c){return malloc(n);}
#define divoom_free free
''',encoding='utf-8')

prelude=r'''
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <assert.h>
#include "cJSON.h"
typedef struct sqlite3 sqlite3;
typedef struct sqlite3_stmt sqlite3_stmt;
#define SQLITE_OK 0
#define SQLITE_NOMEM 7
#define SQLITE_ROW 100
#define SQLITE_DONE 101
static int (*sqlite3_initialize)(void);
static int (*sqlite3_open)(const char*,sqlite3**);
static int (*sqlite3_close)(sqlite3*);
static int (*sqlite3_exec)(sqlite3*,const char*,int(*)(void*,int,char**,char**),void*,char**);
static int (*sqlite3_prepare_v2)(sqlite3*,const char*,int,sqlite3_stmt**,const char**);
static int (*sqlite3_bind_int)(sqlite3_stmt*,int,int);
static int (*sqlite3_step)(sqlite3_stmt*);
static int (*sqlite3_finalize)(sqlite3_stmt*);
static int (*sqlite3_column_int)(sqlite3_stmt*,int);
static double (*sqlite3_column_double)(sqlite3_stmt*,int);
static const unsigned char *(*sqlite3_column_text)(sqlite3_stmt*,int);
#define LOAD(name) do{*(FARPROC*)&name=GetProcAddress(library,#name);assert(name);}while(0)
#define DIVOOM_PHOTO_START_CLOCK_ID 100000
#define DIVOOM_SD_APP_PIC_DIR "/userdata/app_pic"
#define DIVOOM_PIC_ALBUM_TYPE_ALL 1
#define DIVOOM_PIC_ALBUM_TYPE_LIKE 2
#define DIVOOM_PIC_ALBUM_TYPE_HIDE 3
typedef struct {void *lock_handle;sqlite3 *db_handle;} Database;
static Database database;
static Database *pdivoom_database_manage_handle=&database;
static int locks=0;
static void divoom_system_get_lock(void *p){assert(locks==0);locks++;}
static void divoom_system_free_lock(void *p){assert(locks==1);locks--;}
static int divoom_main_get_device_id(void){return 123456789;}
static void divoom_thumb_cache_get_thumb_name(char *source,char *dest){
  strcpy(dest,strstr(source,"/50.webp")?"valid-thumb.webp":"missing-thumb.webp");
}
'''
checks=r'''
static divoom_cJSON *query(const char *text){
  divoom_cJSON *result=http_request(text,0,0,0);assert(locks==0);return result;
}
static void sql(const char *text){assert(sqlite3_exec(database.db_handle,text,NULL,NULL,NULL)==SQLITE_OK);}
static int id(divoom_cJSON *list,int index){return divoom_cJSON_GetObjectInt(divoom_cJSON_GetArrayItem(list,index),"PhotoId");}
int main(void){
  HMODULE library=LoadLibraryA(SQLITE_DLL_PATH);
  char buffer[1024];int i;
  divoom_cJSON *a,*b,*c,*list,*item;
  setbuf(stdout,NULL);assert(library);
  LOAD(sqlite3_initialize);assert(sqlite3_initialize()==SQLITE_OK);LOAD(sqlite3_open);LOAD(sqlite3_close);LOAD(sqlite3_exec);LOAD(sqlite3_prepare_v2);LOAD(sqlite3_bind_int);
  LOAD(sqlite3_step);LOAD(sqlite3_finalize);LOAD(sqlite3_column_int);LOAD(sqlite3_column_double);LOAD(sqlite3_column_text);
  assert(sqlite3_open(":memory:",&database.db_handle)==SQLITE_OK);
  sql("CREATE TABLE album_head(id INTEGER PRIMARY KEY,type INTEGER,name TEXT);"
      "CREATE TABLE pic_info(id INTEGER PRIMARY KEY,save_time BIGINT,path_name TEXT,pic_video_flag INTEGER,like_flag INTEGER,hide_flag INTEGER);"
      "CREATE TABLE album_pic(album_id INTEGER,pic_id INTEGER);"
      "INSERT INTO album_head VALUES(100000,1,'All Photos'),(100001,0,'Normal'),(100002,2,'Likes'),(100003,3,'Hidden'),(100004,4,'Preload'),(100005,0,'Empty');");
  for(i=1;i<=51;i++){
    snprintf(buffer,sizeof(buffer),"INSERT INTO pic_info VALUES(%d,1792400000000,'/userdata/app_pic/%d.%s',%d,%d,%d);INSERT INTO album_pic VALUES(100001,%d);",i,i,i==51?"mp4":"webp",i==51,i==2,i==3,i);sql(buffer);
  }
  sql("INSERT INTO pic_info VALUES(1000,1792500000000,'/outside/app_pic/skip.webp',0,0,0);INSERT INTO album_pic VALUES(100001,1),(100004,3);");
  a=query("{\"Command\":\"Photo/GetLocalAlbumList\"}");assert(a&&divoom_cJSON_GetObjectInt(a,"ReturnCode")==0);
  list=divoom_cJSON_GetObjectItem(a,"AlbumList");assert(divoom_cJSON_GetArraySize(list)==6);assert(divoom_cJSON_GetObjectInt(divoom_cJSON_GetArrayItem(list,0),"ClockId")==100000);
  assert(divoom_cJSON_GetObjectInt(a,"DeviceId")==123456789);divoom_cJSON_Delete(a);
  a=query("{\"Command\":\"Photo/GetPhotoList\",\"ClockId\":100000,\"StartNum\":1,\"EndNum\":50}");
  list=divoom_cJSON_GetObjectItem(a,"PhotoList");assert(divoom_cJSON_GetArraySize(list)==50&&id(list,0)==51&&id(list,49)==2);
  item=divoom_cJSON_GetArrayItem(list,0);assert(!strcmp(divoom_cJSON_GetObjectItem(item,"MediaType")->valuestring,"video"));
  assert(!strcmp(divoom_cJSON_GetObjectItem(item,"OriginalFileId")->valuestring,"/userdata/app_pic/51.mp4"));
  assert(!strcmp(divoom_cJSON_GetObjectItem(item,"FileId")->valuestring,"/userdata/app_pic/51.webp"));
  assert(divoom_cJSON_GetObjectItem(item,"Time")->valuedouble==1792400000.0);divoom_cJSON_Delete(a);
  b=query("{\"Command\":\"Photo/GetPhotoList\",\"ClockId\":100001,\"StartNum\":1,\"EndNum\":50}");
  list=divoom_cJSON_GetObjectItem(b,"PhotoList");assert(divoom_cJSON_GetArraySize(list)==50&&id(list,49)==2);divoom_cJSON_Delete(b);
  c=query("{\"Command\":\"Photo/GetPhotoList\",\"ClockId\":100000,\"StartNum\":51,\"EndNum\":100}");
  list=divoom_cJSON_GetObjectItem(c,"PhotoList");assert(divoom_cJSON_GetArraySize(list)==1&&id(list,0)==1);divoom_cJSON_Delete(c);
  for(i=2;i<=4;i++){
    snprintf(buffer,sizeof(buffer),"{\"Command\":\"Photo/GetPhotoList\",\"ClockId\":%d,\"StartNum\":1,\"EndNum\":50}",100000+i);
    a=query(buffer);list=divoom_cJSON_GetObjectItem(a,"PhotoList");assert(divoom_cJSON_GetArraySize(list)==1&&id(list,0)==(i==4?3:i));divoom_cJSON_Delete(a);
  }
  a=query("{\"Command\":\"Photo/GetPhotoList\",\"ClockId\":100005,\"StartNum\":1,\"EndNum\":50}");
  assert(divoom_cJSON_GetObjectInt(a,"ReturnCode")==0&&divoom_cJSON_GetArraySize(divoom_cJSON_GetObjectItem(a,"PhotoList"))==0);divoom_cJSON_Delete(a);
  a=query("{\"Command\":\"Photo/GetPhotoList\",\"ClockId\":999999,\"StartNum\":1,\"EndNum\":50}");assert(divoom_cJSON_GetObjectInt(a,"ReturnCode")==1);divoom_cJSON_Delete(a);
  a=query("{\"Command\":\"Photo/GetPhotoList\",\"ClockId\":100000,\"StartNum\":0,\"EndNum\":50}");assert(divoom_cJSON_GetObjectInt(a,"ReturnCode")==1);divoom_cJSON_Delete(a);
  a=query("{\"Command\":\"Photo/GetPhotoList\",\"ClockId\":100000,\"StartNum\":1,\"EndNum\":101}");assert(divoom_cJSON_GetObjectInt(a,"ReturnCode")==1);divoom_cJSON_Delete(a);
  a=query("{\"Command\":\"Photo/GetPhotoList\",\"ClockId\":123,\"StartNum\":1,\"EndNum\":50}");assert(legacy_calls==1&&divoom_cJSON_GetObjectInt(divoom_cJSON_GetArrayItem(divoom_cJSON_GetObjectItem(a,"PhotoList"),0),"PhotoId")==77);divoom_cJSON_Delete(a);
  a=query("{\"Command\":\"Unknown/Test\"}");assert(divoom_cJSON_GetObjectInt(a,"ReturnCode")==1);divoom_cJSON_Delete(a);
  FILE *thumb=fopen("valid-thumb.webp","wb");assert(thumb);fputs("data",thumb);fclose(thumb);
  a=query("{\"Command\":\"Photo/GetPhotoList\",\"ClockId\":100000,\"StartNum\":2,\"EndNum\":2}");
  item=divoom_cJSON_GetArrayItem(divoom_cJSON_GetObjectItem(a,"PhotoList"),0);assert(!strcmp(divoom_cJSON_GetObjectItem(item,"FileId")->valuestring,"valid-thumb.webp"));divoom_cJSON_Delete(a);
  check_http();assert(locks==0);sqlite3_close(database.db_handle);database.db_handle=NULL;
  a=query("{\"Command\":\"Photo/GetLocalAlbumList\"}");assert(divoom_cJSON_GetObjectInt(a,"ReturnCode")==1);divoom_cJSON_Delete(a);
  check_mqtt();
  puts("PASS: actual product C query functions + product cJSON + SQLite; album types, 51 same-time photos, cross-album paging, duplicate references, file paths, media types, covers, empty/error responses, legacy routing, lock balance");return 0;
}
'''
sqlite_dll=Path(sys.base_prefix)/'DLLs/sqlite3.dll'
code='#define SQLITE_DLL_PATH '+json.dumps(sqlite_dll.as_posix())+'\n'+prelude
for name in ['divoom_database_manage_get_lan_album_list','divoom_database_manage_get_lan_photo_list']:
    code+='\n'+function(database,name)+'\n'

net=(root/'app/divoom_net_app.c').read_text(encoding='utf-8')
send=re.search(r'void divoom_net_app_send_packet\(uint16 com, uint8 type, void \*data\)\n\{.*?\n\}',net,re.S).group(0)
code+=r"""
#include <time.h>
typedef unsigned char uint8;
typedef unsigned short uint16;
#include "divoom_net_command.h"
#define MQTT_SER 0
#define MQTT_APP 1
#define DIVOOM_POWER_ON_WIFI_MODE 1
#define DIVOOM_MQTT_DEVICE_SET_TOPIC "device/%d"
#define DIVOOM_MQTT_TO_APP_TOPIC "app"
typedef unsigned int uint32;
typedef struct{uint16 cmd;uint8 type;char topic[128];unsigned int cmd_flag;void *cmd_data;int device_id,userid,UTCTime;void (*pfreefunc)(void*);}divoom_net_command;
typedef divoom_net_command *Pdivoom_net_command;
#define DIVOOM_MODEL_NET 1
#define divoom_malloc(size,a,b,c) malloc(size)
#define divoom_free free
#define divoom_print(...) ((void)0)
static void host_send_packet(divoom_net_command *packet);
static unsigned int divoom_net_packet_flag=0;
static int net_ok=0,sends=0;
static divoom_net_command last_send;
static int divoom_net_app_net_is_ok(void){return net_ok;}
static int divoom_power_on_manage_get_power_mode(void){return DIVOOM_POWER_ON_WIFI_MODE;}
static void divoom_net_mqtt_manage_send(divoom_net_command *packet){sends++;last_send=*packet;host_send_packet(packet);}
"""+send+r"""
static void check_mqtt(void){
 int command;
 int allowed[]={DIVOOM_NET_COMM_GET_SYS_BRIGHTNESS,DIVOOM_NET_COMM_PHOTO_GET_LOCAL_ALBUM_LIST,DIVOOM_NET_COMM_PHOTO_GET_LOCAL_PHOTO_LIST,DIVOOM_NET_COMM_PHOTO_APP_ADD_PHOTO,DIVOOM_NET_COMM_PHOTO_ADD_PHOTO_TO_ALBUM,DIVOOM_NET_COMM_PHOTO_REMOVE_PHOTO_FROM_ALBUM,DIVOOM_NET_COMM_PHOTO_DELETE_PHOTO,DIVOOM_NET_COMM_PHOTO_ADD_NEW_ALBUM,DIVOOM_NET_COMM_PHOTO_DELETE_ALBUM};
 for(command=0;command<sizeof(allowed)/sizeof(allowed[0]);command++){
   sends=0;divoom_net_app_send_packet((uint16)allowed[command],DIVOOM_APP_TOPIC,NULL);assert(sends==1);assert(last_send.cmd==allowed[command]&&last_send.type==MQTT_APP);
 }
 sends=0;divoom_net_app_send_packet(99,DIVOOM_APP_TOPIC,NULL);assert(sends==0);
 divoom_net_app_send_packet(DIVOOM_NET_COMM_PHOTO_DELETE_PHOTO,0,NULL);assert(sends==0);
 net_ok=1;divoom_net_app_send_packet(99,DIVOOM_APP_TOPIC,NULL);assert(sends==1);
 puts("PASS: actual product send_packet preserves local photo acknowledgements with MQTT disconnected; other routing unchanged");
}
"""
http_adapter=(Path(__file__).resolve().parents[1]/'tests/firmware/timesframe_http.inc').read_text(encoding='utf-8')
# Extract the registered production read commands, actual PACK/UNPACK and net_app cases.
(out/'divoom_net_command.h').write_bytes((root/'net/include/divoom_net_command.h').read_bytes())
json_source=(root/'net/divoom_net_command_json.c').read_text(encoding='utf-8')
photo_source=(root/'net/divoom_photo_album_josn.c').read_text(encoding='utf-8')
photo_header=(root/'net/include/divoom_photo_album_josn.h').read_text(encoding='utf-8')
type_header=(root/'middle/include/divoom_type.h').read_text(encoding='utf-8')
def extract(source,name):
    match=re.search(r'^[\w *]+\b'+re.escape(name)+r'\([^;]*?\)\n\{.*?^\}',source,re.M|re.S)
    if not match: raise RuntimeError('Missing production function: '+name)
    return match.group(0)+'\n'
def struct(source,name):
    match=re.search(r'typedef struct _'+re.escape(name)+r'\n\{.*?\}[^;]+;',source,re.S)
    if not match: raise RuntimeError('Missing production type: '+name)
    return match.group(0)+'\n'
pipeline=struct(type_header,'divoom_clock_id_info')
for name in ['divoom_photo_album_get_local_photo_respone_info','divoom_photo_album_get_local_photo_request_item','divoom_photo_album_local_list_response','divoom_photo_album_get_local_photo_request_info']:
    pipeline+=struct(photo_header,name)
pipeline+=extract(photo_source,'divoom_photo_album_get_local_photo_list_config_request_pack')
pipeline+=extract(photo_source,'divoom_photo_album_get_local_photo_list_config_respone_unpack')
pipeline+=json_source[json_source.index('typedef void'):json_source.index('const divoom_net_command_json_table_command_info divoom_new_command_string_table')]
for name in ['divoom_new_command_string_table','pdivoom_net_command_async_request_pack_table_func','pdivoom_net_command_async_respone_unpack_table_func']:
    table=re.search(r'^[^\n]*\b'+name+r'\[\][^\n]*\n\{(.*?)^\};',json_source,re.M|re.S).group(0)
    entries=[line for line in table.splitlines() if re.search(r'\{DIVOOM_NET_COMM_PHOTO_GET_LOCAL_(?:ALBUM|PHOTO)_LIST,',line)]
    assert len(entries)==2,name
    pipeline+=table.split('{',1)[0]+'{\n'+'\n'.join(entries)+'\n};\n'
for name in ['divoom_net_command_json_get_cmd','divoom_net_command_json_packet_get_cmd_string','divoom_net_command_json_packet_request','divoom_net_command_json_packet','divoom_net_command_json_unpacket_respone','divoom_net_command_json_unpacket_normal_info','divoom_net_command_json_unpacket']:
    pipeline+=extract(json_source,name)
start=net.index('        case DIVOOM_NET_COMM_PHOTO_GET_LOCAL_ALBUM_LIST:')
end=net.index('        case DIVOOM_NET_COMM_APP_ADD_ALI_PHOTO:',start)
pipeline+='/* PRODUCTION_LEGACY_ADAPTER */\nstatic void host_net_callback(Pdivoom_net_command pnet_info){switch(pnet_info->cmd){\n'+net[start:end]+'}}\n'
pipeline=pipeline.replace('/* PRODUCTION_LEGACY_ADAPTER */','static int legacy_calls;\nstatic void divoom_custom_photo_get_album_local_pic_list(divoom_clock_id_info *clock,int start,int end){\n    divoom_photo_album_get_local_photo_request_item item={0};\n    divoom_photo_album_get_local_photo_request_info response={0};\n    legacy_calls++;item.photo_id=77;strcpy(item.small_name,"legacy.webp");\n    response.num=1;response.plist=&item;\n    divoom_net_app_send_packet(DIVOOM_NET_COMM_PHOTO_GET_LOCAL_PHOTO_LIST,DIVOOM_APP_TOPIC,&response);\n}\n')
http_adapter=http_adapter.replace('/* PRODUCTION_COMMAND_PIPELINE */',pipeline)
http_handler=re.search(r'void divoom_http_server_divoom_api_handler\(struct uh_connection \*conn, int event\)\n\{.*?\n\}',server,re.S).group(0)
code+=http_adapter.replace('/* PRODUCTION_HTTP_HANDLER */',http_handler)+'\n'+checks
(out/'harness.c').write_text(code,encoding='utf-8')
vcvars=Path(r'C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat')
(out/'build.cmd').write_text(f'@call "{vcvars}" >nul\n@cl /nologo /std:c11 /utf-8 /MT /W3 /D_CRT_SECURE_NO_WARNINGS harness.c cJSON.c /Fe:lan-query-test.exe\n@exit /b %errorlevel%\n',encoding='utf-8')
build=subprocess.run(['cmd.exe','/d','/c','build.cmd'],cwd=out,capture_output=True,text=True,encoding="utf-8",errors="replace")
(out/'build.log').write_text(build.stdout+build.stderr,encoding='utf-8')
if build.returncode: print(build.stdout,build.stderr);sys.exit(build.returncode)
test=subprocess.run([str(out/'lan-query-test.exe')],cwd=out,capture_output=True,text=True,encoding="utf-8",errors="replace")
print(str(out));print(test.stdout,test.stderr)
report={'result':'PASS' if test.returncode==0 else 'FAIL','test':'Production registered JSON PACK/UNPACK, net_app dispatch, HTTP and SQLite 3','exitCode':test.returncode,'stdout':test.stdout,'fullFirmwareBuild':False,'deviceUpdated':False,'sourceSha256':{'database':hashlib.sha256((root/'middle/divoom_database_manage.c').read_bytes()).hexdigest(),'http':hashlib.sha256((root/'app/divoom_http_server.c').read_bytes()).hexdigest()}}
(out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
sys.exit(test.returncode)
