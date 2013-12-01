/* search.c */
int search_regcomp __ARGS((char_u *pat, int pat_save, int pat_use, int options, regmmatch_T *regmatch));
char_u *get_search_pat __ARGS((void));
char_u *reverse_text __ARGS((char_u *s));
void save_search_patterns __ARGS((void));
void restore_search_patterns __ARGS((void));
void free_search_patterns __ARGS((void));
int ignorecase __ARGS((char_u *pat));
int pat_has_uppercase __ARGS((char_u *pat));
char_u *last_search_pat __ARGS((void));
void reset_search_dir __ARGS((void));
int searchit __ARGS((win_T *win, buf_T *buf, pos_T *pos, int dir, char_u *pat, long count, int options, int pat_use, linenr_T stop_lnum, proftime_T *tm));
int do_search __ARGS((oparg_T *oap, int dirc, char_u *pat, long count, int options, proftime_T *tm));
int search_for_exact_line __ARGS((buf_T *buf, pos_T *pos, int dir, char_u *pat));
int searchc __ARGS((cmdarg_T *cap, int t_cmd));
pos_T *findmatch __ARGS((oparg_T *oap, int initc));
pos_T *findmatchlimit __ARGS((oparg_T *oap, int initc, int flags, int maxtravel));
void showmatch __ARGS((int c));
int findsent __ARGS((int dir, long count));
int findpar __ARGS((int *pincl, int dir, long count, int what, int both));
int startPS __ARGS((linenr_T lnum, int para, int both));
int fwd_word __ARGS((long count, int bigword, int eol));
int bck_word __ARGS((long count, int bigword, int stop));
int end_word __ARGS((long count, int bigword, int stop, int empty));
int bckend_word __ARGS((long count, int bigword, int eol));
int current_search __ARGS((long count, int forward));
int linewhite __ARGS((linenr_T lnum));
void find_pattern_in_path __ARGS((char_u *ptr, int dir, int len, int whole, int skip_comments, int type, long count, int action, linenr_T start_lnum, linenr_T end_lnum));
/* vim: set ft=c : */
