/* Host adapters for exercising the production HTTP handler, including failure paths. */
#include <stdarg.h>
#define HTTP_STATUS_OK 200
#define UH_EV_COMPLETE 2
#define DIVOOM_HARDWARE_VERSION 511
#define DIVOOM_SOFTWARE_VERSION 511174
#define divoom_free free
#define divoom_print(...) ((void)0)
typedef divoom_net_command *Pdivoom_net_command;
typedef struct {int cmd;void *sem_wait;char *ret_str;} divoom_http_server_item,*Pdivoom_http_server_item;
typedef struct {void *cmd_queue;} divoom_http_server_ctrl;
static divoom_http_server_ctrl http_control;
static divoom_http_server_ctrl *pdivoom_http_server_handle=&http_control;
struct uh_str {const char *p;size_t len;};
struct uh_connection {
    struct uh_str (*get_body)(struct uh_connection*);
    void (*send_head)(struct uh_connection*,int,int,const char*);
    void (*chunk_printf)(struct uh_connection*,const char*,...);
    void (*chunk_send)(struct uh_connection*,const char*,size_t);
    void (*chunk_end)(struct uh_connection*);
    void (*done)(struct uh_connection*);
};
static const char *http_body;
static char http_output[65536];
static size_t http_length;
static int http_heads,http_ends,http_done,allocations,fail_allocation,fail_sem,ack_mode,freed_packets;
static Pdivoom_http_server_item waiting_command;
static void *divoom_system_malloc(size_t size){
    void *memory;
    if(++allocations==fail_allocation)return NULL;
    memory=malloc(size);if(memory)memset(memory,0xa5,size);return memory;
}
static void divoom_system_free(void *memory){free(memory);}
static void *divoom_system_create_sem(int maximum,int initial){return fail_sem?NULL:(void*)1;}
static int divoom_system_get_sem_with_time(void *sem,int seconds){assert(sem);return ack_mode!=1;}
static void divoom_system_destroy_sem(void *sem){assert(sem);}
static void divoom_queue_push(void *queue,void *item){assert(!waiting_command);waiting_command=item;}
static int divoom_http_server_send_command_compare_handle(void *a,void *b){return a==b?0:1;}
static void *divoom_queue_pop_cmp(void *queue,void *item,int(*compare)(void*,void*)){
    void *found=waiting_command;waiting_command=NULL;return found;
}
/* PRODUCTION_COMMAND_PIPELINE */
static void divoom_net_app_free_packet(Pdivoom_net_command packet){if(packet){freed_packets++;free(packet->cmd_data);free(packet);}}
static int route_responses;
static void host_send_packet(divoom_net_command *packet){
    char *reply;
    if(!route_responses)return;
    assert(waiting_command);assert(waiting_command->ret_str==NULL);
    if(ack_mode!=0)return;
    packet->device_id=divoom_main_get_device_id();
    reply=divoom_net_command_json_packet(packet);assert(reply);
    waiting_command->ret_str=divoom_system_malloc(strlen(reply)+1);
    if(waiting_command->ret_str)strcpy(waiting_command->ret_str,reply);
    divoom_free(reply);
}
static void divoom_net_app_push_cmd(Pdivoom_net_command packet){
    route_responses=1;host_net_callback(packet);route_responses=0;divoom_net_app_free_packet(packet);
}
static void divoom_net_app_push_quick_cmd(Pdivoom_net_command packet){divoom_net_app_push_cmd(packet);}
static struct uh_str http_get_body(struct uh_connection *connection){
    struct uh_str body={http_body,strlen(http_body)};return body;
}
static void http_send_head(struct uh_connection *connection,int status,int length,const char *headers){
    assert(status==200);assert(strstr(headers,"application/json"));http_heads++;
}
static void http_chunk_send(struct uh_connection *connection,const char *data,size_t size){
    assert(http_length+size<sizeof(http_output));memcpy(http_output+http_length,data,size);http_length+=size;http_output[http_length]=0;
}
static void http_chunk_printf(struct uh_connection *connection,const char *format,...){
    va_list args;int written;va_start(args,format);
    written=vsnprintf(http_output+http_length,sizeof(http_output)-http_length,format,args);va_end(args);
    assert(written>=0&&(size_t)written<sizeof(http_output)-http_length);http_length+=written;
}
static void http_chunk_end(struct uh_connection *connection){http_ends++;}
static void http_done_request(struct uh_connection *connection){http_done++;}
static struct uh_connection connection={http_get_body,http_send_head,http_chunk_printf,http_chunk_send,http_chunk_end,http_done_request};

/* PRODUCTION_HTTP_HANDLER */

static divoom_cJSON *http_request(const char *body,int failure,int semaphore_failure,int ack){
    divoom_cJSON *response;
    http_body=body;http_length=0;http_output[0]=0;http_heads=http_ends=http_done=0;
    allocations=0;fail_allocation=failure;fail_sem=semaphore_failure;ack_mode=ack;freed_packets=0;waiting_command=NULL;
    divoom_http_server_divoom_api_handler(&connection,UH_EV_COMPLETE);
    assert(http_heads==1&&http_ends==1&&http_done==1);
    response=divoom_cJSON_Parse(http_output);assert(response);return response;
}
static void check_http(void){
    const char *write="{\"Command\":\"Photo/GetLocalAlbumList\"}";
    divoom_cJSON *response;
    response=http_request("{\"Command\":\"Device/GetLanCapabilities\"}",0,0,0);
    assert(divoom_cJSON_GetObjectInt(response,"DeviceId")==123456789);
    assert(divoom_cJSON_GetObjectInt(response,"CanvasWidth")==800&&divoom_cJSON_GetObjectInt(response,"CanvasHeight")==1280);
    assert(divoom_cJSON_GetObjectInt(response,"PhotoUploadMaxBytes")==104857600);
    assert(divoom_cJSON_GetObjectInt(response,"PhotoVideoMaxSeconds")==600);
    assert(!strcmp(divoom_cJSON_GetObjectItem(response,"PhotoVideoCodec")->valuestring,"hevc"));divoom_cJSON_Delete(response);
    response=http_request("{\"Command\":\"Photo/GetLocalAlbumList\"}",0,0,0);
    assert(divoom_cJSON_GetArraySize(divoom_cJSON_GetObjectItem(response,"AlbumList"))==6);assert(freed_packets==1);divoom_cJSON_Delete(response);
    response=http_request("{\"Command\":\"Photo/GetPhotoList\",\"ClockId\":100000,\"StartNum\":51,\"EndNum\":100}",0,0,0);
    assert(divoom_cJSON_GetArraySize(divoom_cJSON_GetObjectItem(response,"PhotoList"))==1);divoom_cJSON_Delete(response);
    response=http_request(write,0,0,0);assert(divoom_cJSON_GetObjectInt(response,"ReturnCode")==0&&freed_packets==1);divoom_cJSON_Delete(response);
    response=http_request(write,0,0,1);assert(divoom_cJSON_GetObjectInt(response,"ReturnCode")==1&&freed_packets==1);divoom_cJSON_Delete(response);
    response=http_request(write,0,0,2);assert(divoom_cJSON_GetObjectInt(response,"ReturnCode")==1&&freed_packets==1);divoom_cJSON_Delete(response);
    response=http_request(write,1,0,0);assert(divoom_cJSON_GetObjectInt(response,"ReturnCode")==1&&freed_packets==0);divoom_cJSON_Delete(response);
    response=http_request(write,2,0,0);assert(divoom_cJSON_GetObjectInt(response,"ReturnCode")==1&&freed_packets==1);divoom_cJSON_Delete(response);
    response=http_request(write,0,1,0);assert(divoom_cJSON_GetObjectInt(response,"ReturnCode")==1&&freed_packets==1);divoom_cJSON_Delete(response);
    response=http_request(write,3,0,0);assert(divoom_cJSON_GetObjectInt(response,"ReturnCode")==1&&freed_packets==1);divoom_cJSON_Delete(response);
    response=http_request("{",0,0,0);assert(divoom_cJSON_GetObjectInt(response,"ReturnCode")==1);divoom_cJSON_Delete(response);
    puts("PASS: production HTTP handler: capabilities, albums, photo paging, queued ACK, timeout, null ACK, allocation failures, semaphore failure and invalid JSON");
}
