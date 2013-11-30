/* os_win16.c */
async_context *async_push __ARGS((async_context *prev_context, async_callback_t callback));
void async_put __ARGS((async_context *context, void *value, size_t length));
void async_get __ARGS((char **p, async_context *context, void *value, size_t length));
void async_return __ARGS((async_context *context, int ret));
async_context *async_pop __ARGS((async_context *context));
void mch_setmouse __ARGS((int on));
void mch_init __ARGS((void));
int mch_check_win __ARGS((int argc, char **argv));
long mch_get_pid __ARGS((void));
int mch_call_shell __ARGS((char_u *cmd, int options));
void mch_delay __ARGS((long msec, int ignoreinput));
void mch_breakcheck __ARGS((void));
long_u mch_avail_mem __ARGS((int special));
int mch_rename __ARGS((const char *pszOldFile, const char *pszNewFile));
char *default_shell __ARGS((void));
/* vim: set ft=c : */
