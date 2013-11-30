/* blowfish.c */
async_context *async_push __ARGS((async_context *prev_context, async_callback_t callback));
void async_put __ARGS((async_context *context, char *value, size_t length));
void async_get __ARGS((char **p, async_context *context, char *value, size_t length));
void async_return __ARGS((async_context *context));
async_context *async_pop __ARGS((async_context *context));
void bf_key_init __ARGS((char_u *password, char_u *salt, int salt_len));
void bf_ofb_init __ARGS((char_u *iv, int iv_len));
void bf_crypt_encode __ARGS((char_u *from, size_t len, char_u *to));
void bf_crypt_decode __ARGS((char_u *ptr, long len));
void bf_crypt_init_keys __ARGS((char_u *passwd));
void bf_crypt_save __ARGS((void));
void bf_crypt_restore __ARGS((void));
int blowfish_self_test __ARGS((void));
/* vim: set ft=c : */
