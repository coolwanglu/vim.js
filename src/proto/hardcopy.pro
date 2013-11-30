/* hardcopy.c */
async_context *async_push __ARGS((async_context *prev_context, async_callback_t callback));
void async_put __ARGS((async_context *context, void *value, size_t length));
void async_get __ARGS((char **p, async_context *context, void *value, size_t length));
void async_return __ARGS((async_context *context, int ret));
async_context *async_pop __ARGS((async_context *context));
char_u *parse_printoptions __ARGS((void));
char_u *parse_printmbfont __ARGS((void));
int prt_header_height __ARGS((void));
int prt_use_number __ARGS((void));
int prt_get_unit __ARGS((int idx));
void ex_hardcopy __ARGS((exarg_T *eap));
void mch_print_cleanup __ARGS((void));
int mch_print_init __ARGS((prt_settings_T *psettings, char_u *jobname, int forceit));
int mch_print_begin __ARGS((prt_settings_T *psettings));
void mch_print_end __ARGS((prt_settings_T *psettings));
int mch_print_end_page __ARGS((void));
int mch_print_begin_page __ARGS((char_u *str));
int mch_print_blank_page __ARGS((void));
void mch_print_start_line __ARGS((int margin, int page_line));
int mch_print_text_out __ARGS((char_u *p, int len));
void mch_print_set_font __ARGS((int iBold, int iItalic, int iUnderline));
void mch_print_set_bg __ARGS((long_u bgcol));
void mch_print_set_fg __ARGS((long_u fgcol));
/* vim: set ft=c : */
