/*
 * os_web.c : provide OS interface with emscripten API
 * Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
 *
 * Mostly modified from os_unix.c
 */

/*
 * os_unix.c -- code for all flavors of Unix (BSD, SYSV, SVR4, POSIX, ...)
 *	     Also for OS/2, using the excellent EMX package!!!
 *	     Also for BeOS and Atari MiNT.
 *
 * A lot of this file was originally written by Juergen Weigert and later
 * changed beyond recognition.
 */

#include "vim.h"

#include "os_unixx.h"	    /* unix includes for os_unix.c only */

/*
 * end of autoconf section. To be extended...
 */

/* Are the following #ifdefs still required? And why? Is that for X11? */

static int  RealWaitForChar __ARGS((int, long, int *));

static int  have_wildcard __ARGS((int, char_u **));
static int  have_dollars __ARGS((int, char_u **));

static int save_patterns __ARGS((int num_pat, char_u **pat, int *num_file, char_u ***file));


static char_u	*extra_shell_arg = NULL;
static int	show_shell_mess = TRUE;

static int curr_tmode = TMODE_COOK;	/* contains current terminal mode */


/*
 * dummy functions to match UNIX interfaces
 */

    void
reset_signals() {}

    int
mch_chdir(path)
    char *path;
{
    if (p_verbose >= 5)
    {
	verbose_enter();
	smsg((char_u *)"chdir(%s)", path);
	verbose_leave();
    }
    return chdir(path);
}

/*
 * Write s[len] to the screen.
 *
    void
mch_write(s, len)
*/

/*
 * mch_inchar(): low level input function.
 * Get a characters from the keyboard.
 * Return the number of characters that are available.
 * If wtime == 0 do not wait for characters.
 * If wtime == n wait a short time for characters.
 * If wtime == -1 wait forever for characters.
 *
    int
mch_inchar(buf, maxlen, wtime, tb_change_cnt)
*/


/*
 * return non-zero if a character is available
 *
    int
mch_char_avail()
*/

#if defined(HAVE_TOTAL_MEM) || defined(PROTO)
# ifdef HAVE_SYS_RESOURCE_H
#  include <sys/resource.h>
# endif
# if defined(HAVE_SYS_SYSCTL_H) && defined(HAVE_SYSCTL)
#  include <sys/sysctl.h>
# endif
# if defined(HAVE_SYS_SYSINFO_H) && defined(HAVE_SYSINFO)
#  include <sys/sysinfo.h>
# endif

/*
 * Return total amount of memory available in Kbyte.
 * Doesn't change when memory has been allocated.
 */
    long_u
mch_total_mem(special)
    int special UNUSED;
{
    long_u	mem = 0;
    long_u	shiftright = 10;  /* how much to shift "mem" right for Kbyte */

#  ifdef HAVE_SYSCTL
    int		mib[2], physmem;
    size_t	len;

    /* BSD way of getting the amount of RAM available. */
    mib[0] = CTL_HW;
    mib[1] = HW_USERMEM;
    len = sizeof(physmem);
    if (sysctl(mib, 2, &physmem, &len, NULL, 0) == 0)
	mem = (long_u)physmem;
#  endif

#  if defined(HAVE_SYS_SYSINFO_H) && defined(HAVE_SYSINFO)
    if (mem == 0)
    {
	struct sysinfo sinfo;

	/* Linux way of getting amount of RAM available */
	if (sysinfo(&sinfo) == 0)
	{
#   ifdef HAVE_SYSINFO_MEM_UNIT
	    /* avoid overflow as much as possible */
	    while (shiftright > 0 && (sinfo.mem_unit & 1) == 0)
	    {
		sinfo.mem_unit = sinfo.mem_unit >> 1;
		--shiftright;
	    }
	    mem = sinfo.totalram * sinfo.mem_unit;
#   else
	    mem = sinfo.totalram;
#   endif
	}
    }
#  endif

#  ifdef HAVE_SYSCONF
    if (mem == 0)
    {
	long	    pagesize, pagecount;

	/* Solaris way of getting amount of RAM available */
	pagesize = sysconf(_SC_PAGESIZE);
	pagecount = sysconf(_SC_PHYS_PAGES);
	if (pagesize > 0 && pagecount > 0)
	{
	    /* avoid overflow as much as possible */
	    while (shiftright > 0 && (pagesize & 1) == 0)
	    {
		pagesize = (long_u)pagesize >> 1;
		--shiftright;
	    }
	    mem = (long_u)pagesize * pagecount;
	}
    }
#  endif

    /* Return the minimum of the physical memory and the user limit, because
     * using more than the user limit may cause Vim to be terminated. */
#  if defined(HAVE_SYS_RESOURCE_H) && defined(HAVE_GETRLIMIT)
    {
	struct rlimit	rlp;

	if (getrlimit(RLIMIT_DATA, &rlp) == 0
		&& rlp.rlim_cur < ((rlim_t)1 << (sizeof(long_u) * 8 - 1))
#   ifdef RLIM_INFINITY
		&& rlp.rlim_cur != RLIM_INFINITY
#   endif
		&& ((long_u)rlp.rlim_cur >> 10) < (mem >> shiftright)
	   )
	{
	    mem = (long_u)rlp.rlim_cur;
	    shiftright = 10;
	}
    }
#  endif

    if (mem > 0)
	return mem >> shiftright;
    return (long_u)0x1fffff;
}
#endif

/*
 * Lu Wang:
 * ignoreinput should always be true
 * see ui.c
 */
    void
mch_delay(msec, ignoreinput)
    long	msec;
    int		ignoreinput;
{
    int		old_tmode;

    if (!ignoreinput)
        EMSG(_("ignoreinput should always be true in Vim.js!"));

    /* Go to cooked mode without echo, to allow SIGINT interrupting us
     * here.  But we don't want QUIT to kill us (CTRL-\ used in a
     * shell may produce SIGQUIT). */
    old_tmode = curr_tmode;
    if (curr_tmode == TMODE_RAW)
        settmode(TMODE_SLEEP);

    vimjs_sleep(msec);

    settmode(old_tmode);
}

#if defined(HAVE_STACK_LIMIT) 
# define HAVE_CHECK_STACK_GROWTH
/*
 * Support for checking for an almost-out-of-stack-space situation.
 */

/*
 * Return a pointer to an item on the stack.  Used to find out if the stack
 * grows up or down.
 */
static void check_stack_growth __ARGS((char *p));
static int stack_grows_downwards;

/*
 * Find out if the stack grows upwards or downwards.
 * "p" points to a variable on the stack of the caller.
 */
    static void
check_stack_growth(p)
    char	*p;
{
    int		i;

    stack_grows_downwards = (p > (char *)&i);
}
#endif

#if defined(HAVE_STACK_LIMIT) || defined(PROTO)
static char *stack_limit = NULL;


/*
 * Find out until how var the stack can grow without getting into trouble.
 * Called when starting up and when switching to the signal stack in
 * deathtrap().
 */
    static void
get_stack_limit()
{
    struct rlimit	rlp;
    int			i;
    long		lim;

    /* Set the stack limit to 15/16 of the allowable size.  Skip this when the
     * limit doesn't fit in a long (rlim_cur might be "long long"). */
    if (getrlimit(RLIMIT_STACK, &rlp) == 0
	    && rlp.rlim_cur < ((rlim_t)1 << (sizeof(long_u) * 8 - 1))
#  ifdef RLIM_INFINITY
	    && rlp.rlim_cur != RLIM_INFINITY
#  endif
       )
    {
	lim = (long)rlp.rlim_cur;
	if (stack_grows_downwards)
	{
	    stack_limit = (char *)((long)&i - (lim / 16L * 15L));
	    if (stack_limit >= (char *)&i)
		/* overflow, set to 1/16 of current stack position */
		stack_limit = (char *)((long)&i / 16L);
	}
	else
	{
	    stack_limit = (char *)((long)&i + (lim / 16L * 15L));
	    if (stack_limit <= (char *)&i)
		stack_limit = NULL;	/* overflow */
	}
    }
}

/*
 * Return FAIL when running out of stack space.
 * "p" must point to any variable local to the caller that's on the stack.
 */
    int
mch_stackcheck(p)
    char	*p;
{
    if (stack_limit != NULL)
    {
	if (stack_grows_downwards)
	{
	    if (p < stack_limit)
		return FAIL;
	}
	else if (p > stack_limit)
	    return FAIL;
    }
    return OK;
}
#endif

# if defined(FEAT_CLIPBOARD) && defined(FEAT_X11)
static void loose_clipboard __ARGS((void));
# ifdef USE_SYSTEM
static void save_clipboard __ARGS((void));
static void restore_clipboard __ARGS((void));

static void *clip_star_save = NULL;
static void *clip_plus_save = NULL;
# endif

/*
 * Called when Vim is going to sleep or execute a shell command.
 * We can't respond to requests for the X selections.  Lose them, otherwise
 * other applications will hang.  But first copy the text to cut buffer 0.
 */
    static void
loose_clipboard()
{
    if (clip_star.owned || clip_plus.owned)
    {
	x11_export_final_selection();
	if (clip_star.owned)
	    clip_lose_selection(&clip_star);
	if (clip_plus.owned)
	    clip_lose_selection(&clip_plus);
	if (x11_display != NULL)
	    XFlush(x11_display);
    }
}

# ifdef USE_SYSTEM
/*
 * Save clipboard text to restore later.
 */
    static void
save_clipboard()
{
    if (clip_star.owned)
	clip_star_save = get_register('*', TRUE);
    if (clip_plus.owned)
	clip_plus_save = get_register('+', TRUE);
}

/*
 * Restore clipboard text if no one own the X selection.
 */
    static void
restore_clipboard()
{
    if (clip_star_save != NULL)
    {
	if (!clip_gen_owner_exists(&clip_star))
	    put_register('*', clip_star_save);
	else
	    free_register(clip_star_save);
	clip_star_save = NULL;
    }
    if (clip_plus_save != NULL)
    {
	if (!clip_gen_owner_exists(&clip_plus))
	    put_register('+', clip_plus_save);
	else
	    free_register(clip_plus_save);
	clip_plus_save = NULL;
    }
}
# endif
#endif

/*
 * If the machine has job control, use it to suspend the program,
 * otherwise fake it by starting a new shell.
 */
    void
mch_suspend()
{
    // TODO
}

    void
mch_init()
{
    Columns = 80;
    Rows = 24;

    out_flush();
}

/*
 * Handling of SIGHUP, SIGQUIT and SIGTERM:
 * "when" == a signal:       when busy, postpone and return FALSE, otherwise
 *			     return TRUE
 * "when" == SIGNAL_BLOCK:   Going to be busy, block signals
 * "when" == SIGNAL_UNBLOCK: Going to wait, unblock signals, use postponed
 *			     signal
 * Returns TRUE when Vim should exit.
 */
    int
vim_handle_signal(sig)
    int		sig;
{
    static int got_signal = 0;
    static int blocked = TRUE;

    switch (sig)
    {
	case SIGNAL_BLOCK:   blocked = TRUE;
			     break;

	case SIGNAL_UNBLOCK: blocked = FALSE;
			     if (got_signal != 0)
			     {
				 kill(getpid(), got_signal);
				 got_signal = 0;
			     }
			     break;

	default:	     if (!blocked)
				 return TRUE;	/* exit! */
			     got_signal = sig;
				 got_int = TRUE;    /* break any loops */
			     break;
    }
    return FALSE;
}

/*
 * Check_win checks whether we have an interactive stdout.
 */
    int
mch_check_win(argc, argv)
    int	    argc UNUSED;
    char    **argv UNUSED;
{
    if (isatty(1))
        return OK;
    return FAIL;
}

/*
 * Return TRUE if the input comes from a terminal, FALSE otherwise.
 */
    int
mch_input_isatty()
{
    if (isatty(read_cmd_fd))
        return TRUE;
    return FALSE;
}

#ifdef FEAT_TITLE

    int
mch_can_restore_title()
{
    return FALSE;
}

    int
mch_can_restore_icon()
{
    return FALSE;
}

/*
 * Set the window title and icon.
 * Lu Wang: this function is quite simplified for browsers
 */
    void
mch_settitle(title, icon)
    char_u *title;
    char_u *icon;
{
    if (title == NULL && icon == NULL)	    /* nothing to do */
        return;

    if (!gui.in_use)
        return;

    gui_mch_settitle(title, icon);
}

/*
 * Restore the window/icon title.
 * "which" is one of:
 *  1  only restore title
 *  2  only restore icon
 *  3  restore title and icon
 */
    void
mch_restore_title(which)
    int which;
{
    // TODO
}

#endif /* FEAT_TITLE */

/*
 * Lu Wang:
 * term name checking, only used when UNIX is defined
 * I don't want to modified the function call in vim
 * so just leave these functions as they are.
 */ 

/*
 * Return TRUE if "name" looks like some xterm name.
 * Seiichi Sato mentioned that "mlterm" works like xterm.
 */
    int
vim_is_xterm(name)
    char_u *name;
{
    if (name == NULL)
	return FALSE;
    return (STRNICMP(name, "xterm", 5) == 0
		|| STRNICMP(name, "nxterm", 6) == 0
		|| STRNICMP(name, "kterm", 5) == 0
		|| STRNICMP(name, "mlterm", 6) == 0
		|| STRNICMP(name, "rxvt", 4) == 0
		|| STRCMP(name, "builtin_xterm") == 0);
}

    int
vim_is_iris(name)
    char_u  *name;
{
    if (name == NULL)
	return FALSE;
    return (STRNICMP(name, "iris-ansi", 9) == 0
	    || STRCMP(name, "builtin_iris-ansi") == 0);
}

    int
vim_is_vt300(name)
    char_u  *name;
{
    if (name == NULL)
	return FALSE;	       /* actually all ANSI comp. terminals should be here  */
    /* catch VT100 - VT5xx */
    return ((STRNICMP(name, "vt", 2) == 0
		&& vim_strchr((char_u *)"12345", name[2]) != NULL)
	    || STRCMP(name, "builtin_vt320") == 0);
}

/*
 * Return TRUE if "name" is a terminal for which 'ttyfast' should be set.
 * This should include all windowed terminal emulators.
 */
    int
vim_is_fastterm(name)
    char_u  *name;
{
    if (name == NULL)
	return FALSE;
    if (vim_is_xterm(name) || vim_is_vt300(name) || vim_is_iris(name))
	return TRUE;
    return (   STRNICMP(name, "hpterm", 6) == 0
	    || STRNICMP(name, "sun-cmd", 7) == 0
	    || STRNICMP(name, "screen", 6) == 0
	    || STRNICMP(name, "dtterm", 6) == 0);
}

/*
 * Insert user name in s[len].
 * Return OK if a name found.
 */
    int
mch_get_user_name(s, len)
    char_u  *s;
    int	    len;
{
    return mch_get_uname(getuid(), s, len);
}

/*
 * Insert user name for "uid" in s[len].
 * Return OK if a name found.
 */
    int
mch_get_uname(uid, s, len)
    uid_t	uid;
    char_u	*s;
    int		len;
{
#if defined(HAVE_PWD_H) && defined(HAVE_GETPWUID)
    struct passwd   *pw;

    if ((pw = getpwuid(uid)) != NULL
	    && pw->pw_name != NULL && *(pw->pw_name) != NUL)
    {
	vim_strncpy(s, (char_u *)pw->pw_name, len - 1);
	return OK;
    }
#endif
    sprintf((char *)s, "%d", (int)uid);	    /* assumes s is long enough */
    return FAIL;			    /* a number is not a name */
}

/*
 * Insert host name is s[len].
 */

#ifdef HAVE_SYS_UTSNAME_H
    void
mch_get_host_name(s, len)
    char_u  *s;
    int	    len;
{
    struct utsname vutsname;

    if (uname(&vutsname) < 0)
	*s = NUL;
    else
	vim_strncpy(s, (char_u *)vutsname.nodename, len - 1);
}
#else /* HAVE_SYS_UTSNAME_H */

# ifdef HAVE_SYS_SYSTEMINFO_H
#  define gethostname(nam, len) sysinfo(SI_HOSTNAME, nam, len)
# endif

    void
mch_get_host_name(s, len)
    char_u  *s;
    int	    len;
{
    gethostname((char *)s, len);
    s[len - 1] = NUL;	/* make sure it's terminated */
}
#endif /* HAVE_SYS_UTSNAME_H */

/*
 * return process ID
 */
    long
mch_get_pid()
{
    return (long)getpid();
}

#if !defined(HAVE_STRERROR) && defined(USE_GETCWD)
static char *strerror __ARGS((int));

    static char *
strerror(err)
    int err;
{
    extern int	    sys_nerr;
    extern char	    *sys_errlist[];
    static char	    er[20];

    if (err > 0 && err < sys_nerr)
	return (sys_errlist[err]);
    sprintf(er, "Error %d", err);
    return er;
}
#endif

/*
 * Get name of current directory into buffer 'buf' of length 'len' bytes.
 * Return OK for success, FAIL for failure.
 */
    int
mch_dirname(buf, len)
    char_u  *buf;
    int	    len;
{
#if defined(USE_GETCWD)
    if (getcwd((char *)buf, len) == NULL)
    {
	STRCPY(buf, strerror(errno));
	return FAIL;
    }
    return OK;
#else
    return (getwd((char *)buf) != NULL ? OK : FAIL);
#endif
}

#if defined(PROTO)
/*
 * Replace all slashes by backslashes.
 * When 'shellslash' set do it the other way around.
 */
    void
slash_adjust(p)
    char_u  *p;
{
    while (*p)
    {
	if (*p == psepcN)
	    *p = psepc;
	mb_ptr_adv(p);
    }
}
#endif

/*
 * Get absolute file name into "buf[len]".
 *
 * return FAIL for failure, OK for success
 */
    int
mch_FullName(fname, buf, len, force)
    char_u	*fname, *buf;
    int		len;
    int		force;		/* also expand when already absolute path */
{
    int		l;
#ifdef HAVE_FCHDIR
    int		fd = -1;
    static int	dont_fchdir = FALSE;	/* TRUE when fchdir() doesn't work */
#endif
    char_u	olddir[MAXPATHL];
    char_u	*p;
    int		retval = OK;


    /* expand it if forced or not an absolute path */
    if (force || !mch_isFullName(fname))
    {
	/*
	 * If the file name has a path, change to that directory for a moment,
	 * and then do the getwd() (and get back to where we were).
	 * This will get the correct path name with "../" things.
	 */
	if ((p = vim_strrchr(fname, '/')) != NULL)
	{
#ifdef HAVE_FCHDIR
	    /*
	     * Use fchdir() if possible, it's said to be faster and more
	     * reliable.  But on SunOS 4 it might not work.  Check this by
	     * doing a fchdir() right now.
	     */
	    if (!dont_fchdir)
	    {
		fd = open(".", O_RDONLY | O_EXTRA, 0);
		if (fd >= 0 && fchdir(fd) < 0)
		{
		    close(fd);
		    fd = -1;
		    dont_fchdir = TRUE;	    /* don't try again */
		}
	    }
#endif

	    /* Only change directory when we are sure we can return to where
	     * we are now.  After doing "su" chdir(".") might not work. */
	    if (
#ifdef HAVE_FCHDIR
		fd < 0 &&
#endif
			(mch_dirname(olddir, MAXPATHL) == FAIL
					   || mch_chdir((char *)olddir) != 0))
	    {
		p = NULL;	/* can't get current dir: don't chdir */
		retval = FAIL;
	    }
	    else
	    {
		/* The directory is copied into buf[], to be able to remove
		 * the file name without changing it (could be a string in
		 * read-only memory) */
		if (p - fname >= len)
		    retval = FAIL;
		else
		{
		    vim_strncpy(buf, fname, p - fname);
		    if (mch_chdir((char *)buf))
			retval = FAIL;
		    else
			fname = p + 1;
		    *buf = NUL;
		}
	    }
	}
	if (mch_dirname(buf, len) == FAIL)
	{
	    retval = FAIL;
	    *buf = NUL;
	}
	if (p != NULL)
	{
#ifdef HAVE_FCHDIR
	    if (fd >= 0)
	    {
		if (p_verbose >= 5)
		{
		    verbose_enter();
		    MSG("fchdir() to previous dir");
		    verbose_leave();
		}
		l = fchdir(fd);
		close(fd);
	    }
	    else
#endif
		l = mch_chdir((char *)olddir);
	    if (l != 0)
		EMSG(_(e_prev_dir));
	}

	l = STRLEN(buf);
	if (l >= len - 1)
	    retval = FAIL; /* no space for trailing "/" */
	else if (l > 0 && buf[l - 1] != '/' && *fname != NUL
						   && STRCMP(fname, ".") != 0)
	    STRCAT(buf, "/");
    }

    /* Catch file names which are too long. */
    if (retval == FAIL || (int)(STRLEN(buf) + STRLEN(fname)) >= len)
	return FAIL;

    /* Do not append ".", "/dir/." is equal to "/dir". */
    if (STRCMP(fname, ".") != 0)
	STRCAT(buf, fname);

    return OK;
}

/*
 * Return TRUE if "fname" does not depend on the current directory.
 */
    int
mch_isFullName(fname)
    char_u	*fname;
{
    return (*fname == '/' || *fname == '~');
}

#if defined(USE_FNAME_CASE) || defined(PROTO)
/*
 * Set the case of the file name, if it already exists.  This will cause the
 * file name to remain exactly the same.
 * Only required for file systems where case is ignored and preserved.
 */
    void
fname_case(name, len)
    char_u	*name;
    int		len UNUSED;  /* buffer size, only used when name gets longer */
{
    struct stat st;
    char_u	*slash, *tail;
    DIR		*dirp;
    struct dirent *dp;

    if (lstat((char *)name, &st) >= 0)
    {
	/* Open the directory where the file is located. */
	slash = vim_strrchr(name, '/');
	if (slash == NULL)
	{
	    dirp = opendir(".");
	    tail = name;
	}
	else
	{
	    *slash = NUL;
	    dirp = opendir((char *)name);
	    *slash = '/';
	    tail = slash + 1;
	}

	if (dirp != NULL)
	{
	    while ((dp = readdir(dirp)) != NULL)
	    {
		/* Only accept names that differ in case and are the same byte
		 * length. TODO: accept different length name. */
		if (STRICMP(tail, dp->d_name) == 0
			&& STRLEN(tail) == STRLEN(dp->d_name))
		{
		    char_u	newname[MAXPATHL + 1];
		    struct stat st2;

		    /* Verify the inode is equal. */
		    vim_strncpy(newname, name, MAXPATHL);
		    vim_strncpy(newname + (tail - name), (char_u *)dp->d_name,
						    MAXPATHL - (tail - name));
		    if (lstat((char *)newname, &st2) >= 0
			    && st.st_ino == st2.st_ino
			    && st.st_dev == st2.st_dev)
		    {
			STRCPY(tail, dp->d_name);
			break;
		    }
		}
	    }

	    closedir(dirp);
	}
    }
}
#endif

/*
 * Get file permissions for 'name'.
 * Returns -1 when it doesn't exist.
 */
    long
mch_getperm(name)
    char_u *name;
{
    struct stat statb;

    /* Keep the #ifdef outside of stat(), it may be a macro. */
    if (stat((char *)name, &statb))
        return -1;
    return statb.st_mode;
}

/*
 * set file permission for 'name' to 'perm'
 *
 * return FAIL for failure, OK otherwise
 */
    int
mch_setperm(name, perm)
    char_u  *name;
    long    perm;
{
    return (chmod((char *)
		    name,
		    (mode_t)perm) == 0 ? OK : FAIL);
}

#if defined(HAVE_ACL) || defined(PROTO)
# ifdef HAVE_SYS_ACL_H
#  include <sys/acl.h>
# endif
# ifdef HAVE_SYS_ACCESS_H
#  include <sys/access.h>
# endif

# ifdef HAVE_SOLARIS_ACL
typedef struct vim_acl_solaris_T {
    int acl_cnt;
    aclent_t *acl_entry;
} vim_acl_solaris_T;
# endif


/*
 * Return a pointer to the ACL of file "fname" in allocated memory.
 * Return NULL if the ACL is not available for whatever reason.
 */
    vim_acl_T
mch_get_acl(fname)
    char_u	*fname UNUSED;
{
    vim_acl_T	ret = NULL;
#ifdef HAVE_POSIX_ACL
    ret = (vim_acl_T)acl_get_file((char *)fname, ACL_TYPE_ACCESS);
#else
#ifdef HAVE_SOLARIS_ZFS_ACL
    acl_t *aclent;

    if (acl_get((char *)fname, 0, &aclent) < 0)
	return NULL;
    ret = (vim_acl_T)aclent;
#else
#ifdef HAVE_SOLARIS_ACL
    vim_acl_solaris_T   *aclent;

    aclent = malloc(sizeof(vim_acl_solaris_T));
    if ((aclent->acl_cnt = acl((char *)fname, GETACLCNT, 0, NULL)) < 0)
    {
	free(aclent);
	return NULL;
    }
    aclent->acl_entry = malloc(aclent->acl_cnt * sizeof(aclent_t));
    if (acl((char *)fname, GETACL, aclent->acl_cnt, aclent->acl_entry) < 0)
    {
	free(aclent->acl_entry);
	free(aclent);
	return NULL;
    }
    ret = (vim_acl_T)aclent;
#else
#if defined(HAVE_AIX_ACL)
    int		aclsize;
    struct acl *aclent;

    aclsize = sizeof(struct acl);
    aclent = malloc(aclsize);
    if (statacl((char *)fname, STX_NORMAL, aclent, aclsize) < 0)
    {
	if (errno == ENOSPC)
	{
	    aclsize = aclent->acl_len;
	    aclent = realloc(aclent, aclsize);
	    if (statacl((char *)fname, STX_NORMAL, aclent, aclsize) < 0)
	    {
		free(aclent);
		return NULL;
	    }
	}
	else
	{
	    free(aclent);
	    return NULL;
	}
    }
    ret = (vim_acl_T)aclent;
#endif /* HAVE_AIX_ACL */
#endif /* HAVE_SOLARIS_ACL */
#endif /* HAVE_SOLARIS_ZFS_ACL */
#endif /* HAVE_POSIX_ACL */
    return ret;
}

/*
 * Set the ACL of file "fname" to "acl" (unless it's NULL).
 */
    void
mch_set_acl(fname, aclent)
    char_u	*fname UNUSED;
    vim_acl_T	aclent;
{
    if (aclent == NULL)
	return;
#ifdef HAVE_POSIX_ACL
    acl_set_file((char *)fname, ACL_TYPE_ACCESS, (acl_t)aclent);
#else
#ifdef HAVE_SOLARIS_ZFS_ACL
    acl_set((char *)fname, (acl_t *)aclent);
#else
#ifdef HAVE_SOLARIS_ACL
    acl((char *)fname, SETACL, ((vim_acl_solaris_T *)aclent)->acl_cnt,
	    ((vim_acl_solaris_T *)aclent)->acl_entry);
#else
#ifdef HAVE_AIX_ACL
    chacl((char *)fname, aclent, ((struct acl *)aclent)->acl_len);
#endif /* HAVE_AIX_ACL */
#endif /* HAVE_SOLARIS_ACL */
#endif /* HAVE_SOLARIS_ZFS_ACL */
#endif /* HAVE_POSIX_ACL */
}

    void
mch_free_acl(aclent)
    vim_acl_T	aclent;
{
    if (aclent == NULL)
	return;
#ifdef HAVE_POSIX_ACL
    acl_free((acl_t)aclent);
#else
#ifdef HAVE_SOLARIS_ZFS_ACL
    acl_free((acl_t *)aclent);
#else
#ifdef HAVE_SOLARIS_ACL
    free(((vim_acl_solaris_T *)aclent)->acl_entry);
    free(aclent);
#else
#ifdef HAVE_AIX_ACL
    free(aclent);
#endif /* HAVE_AIX_ACL */
#endif /* HAVE_SOLARIS_ACL */
#endif /* HAVE_SOLARIS_ZFS_ACL */
#endif /* HAVE_POSIX_ACL */
}
#endif

/*
 * Set hidden flag for "name".
 */
    void
mch_hide(name)
    char_u	*name UNUSED;
{
    /* can't hide a file */
}

/*
 * return TRUE if "name" is a directory
 * return FALSE if "name" is not a directory
 * return FALSE for error
 */
    int
mch_isdir(name)
    char_u *name;
{
    struct stat statb;

    if (*name == NUL)	    /* Some stat()s don't flag "" as an error. */
	return FALSE;
    if (stat((char *)name, &statb))
	return FALSE;
#ifdef _POSIX_SOURCE
    return (S_ISDIR(statb.st_mode) ? TRUE : FALSE);
#else
    return ((statb.st_mode & S_IFMT) == S_IFDIR ? TRUE : FALSE);
#endif
}

static int executable_file __ARGS((char_u *name));

/*
 * Return 1 if "name" is an executable file, 0 if not or it doesn't exist.
 */
    static int
executable_file(name)
    char_u	*name;
{
    struct stat	st;

    if (stat((char *)name, &st))
	return 0;
    return S_ISREG(st.st_mode) && mch_access((char *)name, X_OK) == 0;
}

/*
 * Return 1 if "name" can be found in $PATH and executed, 0 if not.
 * Return -1 if unknown.
 */
    int
mch_can_exe(name)
    char_u	*name;
{
    char_u	*buf;
    char_u	*p, *e;
    int		retval;

    /* If it's an absolute or relative path don't need to use $PATH. */
    if (mch_isFullName(name) || (name[0] == '.' && (name[1] == '/'
				      || (name[1] == '.' && name[2] == '/'))))
	return executable_file(name);

    p = (char_u *)getenv("PATH");
    if (p == NULL || *p == NUL)
	return -1;
    buf = alloc((unsigned)(STRLEN(name) + STRLEN(p) + 2));
    if (buf == NULL)
	return -1;

    /*
     * Walk through all entries in $PATH to check if "name" exists there and
     * is an executable file.
     */
    for (;;)
    {
	e = (char_u *)strchr((char *)p, ':');
	if (e == NULL)
	    e = p + STRLEN(p);
	if (e - p <= 1)		/* empty entry means current dir */
	    STRCPY(buf, "./");
	else
	{
	    vim_strncpy(buf, p, e - p);
	    add_pathsep(buf);
	}
	STRCAT(buf, name);
	retval = executable_file(buf);
	if (retval == 1)
	    break;

	if (*e != ':')
	    break;
	p = e + 1;
    }

    vim_free(buf);
    return retval;
}

/*
 * Check what "name" is:
 * NODE_NORMAL: file or directory (or doesn't exist)
 * NODE_WRITABLE: writable device, socket, fifo, etc.
 * NODE_OTHER: non-writable things
 */
    int
mch_nodetype(name)
    char_u	*name;
{
    struct stat	st;

    if (stat((char *)name, &st))
	return NODE_NORMAL;
    if (S_ISREG(st.st_mode) || S_ISDIR(st.st_mode))
	return NODE_NORMAL;
    if (S_ISBLK(st.st_mode))	/* block device isn't writable */
        return NODE_OTHER;
    /* Everything else is writable? */
    return NODE_WRITABLE;
}

    void
mch_early_init()
{
#ifdef HAVE_CHECK_STACK_GROWTH
    int			i;

    check_stack_growth((char *)&i);

# ifdef HAVE_STACK_LIMIT
    get_stack_limit();
# endif

#endif

}

#if defined(EXITFREE) || defined(PROTO)
    void
mch_free_mem()
{
# if defined(HAVE_SIGALTSTACK) || defined(HAVE_SIGSTACK)
    vim_free(signal_stack);
    signal_stack = NULL;
# endif
# ifdef FEAT_TITLE
    vim_free(oldtitle);
    vim_free(oldicon);
# endif
}
#endif

static void exit_scroll __ARGS((void));

/*
 * Output a newline when exiting.
 * Make sure the newline goes to the same stream as the text.
 */
    static void
exit_scroll()
{
    if (silent_mode)
	return;
    if (newline_on_exit || msg_didout)
    {
	if (msg_use_printf())
	{
	    if (info_message)
		mch_msg("\n");
	    else
		mch_errmsg("\r\n");
	}
	else
	    out_char('\n');
    }
    else
    {
	restore_cterm_colors();		/* get original colors back */
	msg_clr_eos_force();		/* clear the rest of the display */
	windgoto((int)Rows - 1, 0);	/* may have moved the cursor */
    }
}

    void
mch_exit(r)
    int r;
{
    exiting = TRUE;

    if (!gui.in_use)
    {
	settmode(TMODE_COOK);
#ifdef FEAT_TITLE
	mch_restore_title(3);	/* restore xterm title and icon name */
#endif
	/*
	 * When t_ti is not empty but it doesn't cause swapping terminal
	 * pages, need to output a newline when msg_didout is set.  But when
	 * t_ti does swap pages it should not go to the shell page.  Do this
	 * before stoptermcap().
	 */
	if (swapping_screen() && !newline_on_exit)
	    exit_scroll();

	/* Stop termcap: May need to check for T_CRV response, which
	 * requires RAW mode. */
	stoptermcap();

	/*
	 * A newline is only required after a message in the alternate screen.
	 * This is set to TRUE by wait_return().
	 */
	if (!swapping_screen() || newline_on_exit)
	    exit_scroll();

	/* Cursor may have been switched off without calling starttermcap()
	 * when doing "vim -u vimrc" and vimrc contains ":q". */
	if (full_screen)
	    cursor_on();
    }
    out_flush();
    ml_close_all(TRUE);		/* remove all memfiles */
    if (gui.in_use)
        gui_exit(r);

#ifdef EXITFREE
    free_all_mem();
#endif

    exit(r);
}

    void
mch_settmode(tmode)
    int		tmode;
{
    static int first = TRUE;

    /* Why is NeXT excluded here (and not in os_unixx.h)? */
#if defined(ECHOE) && defined(ICANON) && (defined(HAVE_TERMIO_H) || defined(HAVE_TERMIOS_H)) && !defined(__NeXT__)
    /*
     * for "new" tty systems
     */
# ifdef HAVE_TERMIOS_H
    static struct termios told;
	   struct termios tnew;
# else
    static struct termio told;
	   struct termio tnew;
# endif

    if (first)
    {
	first = FALSE;
# if defined(HAVE_TERMIOS_H)
	tcgetattr(read_cmd_fd, &told);
# else
	ioctl(read_cmd_fd, TCGETA, &told);
# endif
    }

    tnew = told;
    if (tmode == TMODE_RAW)
    {
	/*
	 * ~ICRNL enables typing ^V^M
	 */
	tnew.c_iflag &= ~ICRNL;
	tnew.c_lflag &= ~(ICANON | ECHO | ISIG | ECHOE
# if defined(IEXTEN) && !defined(__MINT__)
		    | IEXTEN	    /* IEXTEN enables typing ^V on SOLARIS */
				    /* but it breaks function keys on MINT */
# endif
				);
# ifdef ONLCR	    /* don't map NL -> CR NL, we do it ourselves */
	tnew.c_oflag &= ~ONLCR;
# endif
	tnew.c_cc[VMIN] = 1;		/* return after 1 char */
	tnew.c_cc[VTIME] = 0;		/* don't wait */
    }
    else if (tmode == TMODE_SLEEP)
	tnew.c_lflag &= ~(ECHO);

# if defined(HAVE_TERMIOS_H)
    {
	int	n = 10;

	/* A signal may cause tcsetattr() to fail (e.g., SIGCONT).  Retry a
	 * few times. */
	while (tcsetattr(read_cmd_fd, TCSANOW, &tnew) == -1
						   && errno == EINTR && n > 0)
	    --n;
    }
# else
    ioctl(read_cmd_fd, TCSETA, &tnew);
# endif

#else

    /*
     * for "old" tty systems
     */
# ifndef TIOCSETN
#  define TIOCSETN TIOCSETP	/* for hpux 9.0 */
# endif
    static struct sgttyb ttybold;
	   struct sgttyb ttybnew;

    if (first)
    {
	first = FALSE;
	ioctl(read_cmd_fd, TIOCGETP, &ttybold);
    }

    ttybnew = ttybold;
    if (tmode == TMODE_RAW)
    {
	ttybnew.sg_flags &= ~(CRMOD | ECHO);
	ttybnew.sg_flags |= RAW;
    }
    else if (tmode == TMODE_SLEEP)
	ttybnew.sg_flags &= ~(ECHO);
    ioctl(read_cmd_fd, TIOCSETN, &ttybnew);
#endif
    curr_tmode = tmode;
}

/*
 * Try to get the code for "t_kb" from the stty setting
 *
 * Even if termcap claims a backspace key, the user's setting *should*
 * prevail.  stty knows more about reality than termcap does, and if
 * somebody's usual erase key is DEL (which, for most BSD users, it will
 * be), they're going to get really annoyed if their erase key starts
 * doing forward deletes for no reason. (Eric Fischer)
 */
    void
get_stty()
{
    char_u  buf[2];
    char_u  *p;

    /* Why is NeXT excluded here (and not in os_unixx.h)? */
#if defined(ECHOE) && defined(ICANON) && (defined(HAVE_TERMIO_H) || defined(HAVE_TERMIOS_H)) && !defined(__NeXT__)
    /* for "new" tty systems */
# ifdef HAVE_TERMIOS_H
    struct termios keys;
# else
    struct termio keys;
# endif

# if defined(HAVE_TERMIOS_H)
    if (tcgetattr(read_cmd_fd, &keys) != -1)
# else
    if (ioctl(read_cmd_fd, TCGETA, &keys) != -1)
# endif
    {
	buf[0] = keys.c_cc[VERASE];
	intr_char = keys.c_cc[VINTR];
#else
    /* for "old" tty systems */
    struct sgttyb keys;

    if (ioctl(read_cmd_fd, TIOCGETP, &keys) != -1)
    {
	buf[0] = keys.sg_erase;
	intr_char = keys.sg_kill;
#endif
	buf[1] = NUL;
	add_termcode((char_u *)"kb", buf, FALSE);

	/*
	 * If <BS> and <DEL> are now the same, redefine <DEL>.
	 */
	p = find_termcode((char_u *)"kD");
	if (p != NULL && p[0] == buf[0] && p[1] == buf[1])
	    do_fixdel(NULL);
    }
#if 0
    }	    /* to keep cindent happy */
#endif
}



/*
 * set screen mode, always fails.
 */
    int
mch_screenmode(arg)
    char_u   *arg UNUSED;
{
    EMSG(_(e_screenmode));
    return FAIL;
}

/*
 * Lu Wang:
 * should never be called as GUI is always used
 */
    int
mch_get_shellsize()
{
    Rows = 1;
    Columns = 1;
    limit_screen_size();
    return OK;
}

/*
 * Try to set the window size to Rows and Columns.
 */
    void
mch_set_shellsize()
{
    // TODO
}

/*
 * Rows and/or Columns has changed.
 */
    void
mch_new_shellsize()
{
    /* Nothing to do. */
}

    int
mch_call_shell(cmd, options)
    char_u	*cmd;
    int		options;	/* SHELL_*, see vim.h */
{
    vimjs_call_shell((char*)cmd, options);
    return 0;
}


/*
 * Check for CTRL-C typed by reading all available characters.
 * In cooked mode we should get SIGINT, no need to check.
 */
    void
mch_breakcheck()
{
    if (curr_tmode == TMODE_RAW && RealWaitForChar(read_cmd_fd, 0L, NULL))
	fill_input_buf(FALSE);
}


/*
 * Wait "msec" msec until a character is available from file descriptor "fd".
 * "msec" == 0 will check for characters once.
 * "msec" == -1 will block until a character is available.
 * When a GUI is being used, this will not be used for input -- webb
 * Returns also, when a request from Sniff is waiting -- toni.
 * Or when a Linux GPM mouse event is waiting.
 */
    static  int
RealWaitForChar(fd, msec, check_for_gpm)
    int		fd;
    long	msec;
    int		*check_for_gpm UNUSED;
{
    int		ret;

#ifdef MAY_LOOP
    for (;;)
#endif
    {
#ifdef MAY_LOOP
	int		finished = TRUE; /* default is to 'loop' just once */
#endif

	struct pollfd   fds[6];
	int		nfd;
	int		towait = (int)msec;

	fds[0].fd = fd;
	fds[0].events = POLLIN;
	nfd = 1;

# ifdef FEAT_SNIFF
#  define SNIFF_IDX 1
	if (want_sniff_request)
	{
	    fds[SNIFF_IDX].fd = fd_from_sniff;
	    fds[SNIFF_IDX].events = POLLIN;
	    nfd++;
	}
# endif
	ret = poll(fds, nfd, towait);

# ifdef FEAT_SNIFF
	if (ret < 0)
	    sniff_disconnect(1);
	else if (want_sniff_request)
	{
	    if (fds[SNIFF_IDX].revents & POLLHUP)
		sniff_disconnect(1);
	    if (fds[SNIFF_IDX].revents & POLLIN)
		sniff_request_waiting = 1;
	}
# endif


#ifdef MAY_LOOP
	if (finished || msec == 0)
	    break;

	/* We're going to loop around again, find out for how long */
	if (msec > 0)
	{
# ifdef USE_START_TV
	    struct timeval  mtv;

	    /* Compute remaining wait time. */
	    gettimeofday(&mtv, NULL);
	    msec -= (mtv.tv_sec - start_tv.tv_sec) * 1000L
				   + (mtv.tv_usec - start_tv.tv_usec) / 1000L;
# else
	    /* Guess we got interrupted halfway. */
	    msec = msec / 2;
# endif
	    if (msec <= 0)
		break;	/* waited long enough */
	}
#endif
    }

    return (ret > 0);
}

#ifndef NO_EXPANDPATH
/*
 * Expand a path into all matching files and/or directories.  Handles "*",
 * "?", "[a-z]", "**", etc.
 * "path" has backslashes before chars that are not to be expanded.
 * Returns the number of matches found.
 */
    int
mch_expandpath(gap, path, flags)
    garray_T	*gap;
    char_u	*path;
    int		flags;		/* EW_* flags */
{
    return unix_expandpath(gap, path, 0, flags, FALSE);
}
#endif

/*
 * mch_expand_wildcards() - this code does wild-card pattern matching using
 * the shell
 *
 * return OK for success, FAIL for error (you may lose some memory) and put
 * an error message in *file.
 *
 * num_pat is number of input patterns
 * pat is array of pointers to input patterns
 * num_file is pointer to number of matched file names
 * file is pointer to array of pointers to matched file names
 */

#ifndef SEEK_SET
# define SEEK_SET 0
#endif
#ifndef SEEK_END
# define SEEK_END 2
#endif

#define SHELL_SPECIAL (char_u *)"\t \"&'$;<>()\\|"

    int
mch_expand_wildcards(num_pat, pat, num_file, file, flags)
    int		   num_pat;
    char_u	 **pat;
    int		  *num_file;
    char_u	***file;
    int		   flags;	/* EW_* flags */
{
    int		i;
    size_t	len;
    char_u	*p;
    int		dir;

    /*
     * This is the non-OS/2 implementation (really Unix).
     */
    int		j;
    char_u	*tempname;
    char_u	*command;
    FILE	*fd;
    char_u	*buffer;
#define STYLE_ECHO	0	/* use "echo", the default */
#define STYLE_GLOB	1	/* use "glob", for csh */
#define STYLE_VIMGLOB	2	/* use "vimglob", for Posix sh */
#define STYLE_PRINT	3	/* use "print -N", for zsh */
#define STYLE_BT	4	/* `cmd` expansion, execute the pattern
				 * directly */
    int		shell_style = STYLE_ECHO;
    int		check_spaces;
    static int	did_find_nul = FALSE;
    int		ampersent = FALSE;
		/* vimglob() function to define for Posix shell */
    static char *sh_vimglob_func = "vimglob() { while [ $# -ge 1 ]; do echo \"$1\"; shift; done }; vimglob >";

    *num_file = 0;	/* default: no files found */
    *file = NULL;

    /*
     * If there are no wildcards, just copy the names to allocated memory.
     * Saves a lot of time, because we don't have to start a new shell.
     */
    if (!have_wildcard(num_pat, pat))
	return save_patterns(num_pat, pat, num_file, file);

# ifdef HAVE_SANDBOX
    /* Don't allow any shell command in the sandbox. */
    if (sandbox != 0 && check_secure())
	return FAIL;
# endif

    /*
     * Don't allow the use of backticks in secure and restricted mode.
     */
    if (secure || restricted)
	for (i = 0; i < num_pat; ++i)
	    if (vim_strchr(pat[i], '`') != NULL
		    && (check_restricted() || check_secure()))
		return FAIL;

    /*
     * get a name for the temp file
     */
    if ((tempname = vim_tempname('o')) == NULL)
    {
	EMSG(_(e_notmp));
	return FAIL;
    }

    /*
     * Let the shell expand the patterns and write the result into the temp
     * file.
     * STYLE_BT:	NL separated
     *	    If expanding `cmd` execute it directly.
     * STYLE_GLOB:	NUL separated
     *	    If we use *csh, "glob" will work better than "echo".
     * STYLE_PRINT:	NL or NUL separated
     *	    If we use *zsh, "print -N" will work better than "glob".
     * STYLE_VIMGLOB:	NL separated
     *	    If we use *sh*, we define "vimglob()".
     * STYLE_ECHO:	space separated.
     *	    A shell we don't know, stay safe and use "echo".
     */
    if (num_pat == 1 && *pat[0] == '`'
	    && (len = STRLEN(pat[0])) > 2
	    && *(pat[0] + len - 1) == '`')
	shell_style = STYLE_BT;
    else if ((len = STRLEN(p_sh)) >= 3)
    {
	if (STRCMP(p_sh + len - 3, "csh") == 0)
	    shell_style = STYLE_GLOB;
	else if (STRCMP(p_sh + len - 3, "zsh") == 0)
	    shell_style = STYLE_PRINT;
    }
    if (shell_style == STYLE_ECHO && strstr((char *)gettail(p_sh),
								"sh") != NULL)
	shell_style = STYLE_VIMGLOB;

    /* Compute the length of the command.  We need 2 extra bytes: for the
     * optional '&' and for the NUL.
     * Worst case: "unset nonomatch; print -N >" plus two is 29 */
    len = STRLEN(tempname) + 29;
    if (shell_style == STYLE_VIMGLOB)
	len += STRLEN(sh_vimglob_func);

    for (i = 0; i < num_pat; ++i)
    {
	/* Count the length of the patterns in the same way as they are put in
	 * "command" below. */
#ifdef USE_SYSTEM
	len += STRLEN(pat[i]) + 3;	/* add space and two quotes */
#else
	++len;				/* add space */
	for (j = 0; pat[i][j] != NUL; ++j)
	{
	    if (vim_strchr(SHELL_SPECIAL, pat[i][j]) != NULL)
		++len;		/* may add a backslash */
	    ++len;
	}
#endif
    }
    command = alloc(len);
    if (command == NULL)
    {
	/* out of memory */
	vim_free(tempname);
	return FAIL;
    }

    /*
     * Build the shell command:
     * - Set $nonomatch depending on EW_NOTFOUND (hopefully the shell
     *	 recognizes this).
     * - Add the shell command to print the expanded names.
     * - Add the temp file name.
     * - Add the file name patterns.
     */
    if (shell_style == STYLE_BT)
    {
	/* change `command; command& ` to (command; command ) */
	STRCPY(command, "(");
	STRCAT(command, pat[0] + 1);		/* exclude first backtick */
	p = command + STRLEN(command) - 1;
	*p-- = ')';				/* remove last backtick */
	while (p > command && vim_iswhite(*p))
	    --p;
	if (*p == '&')				/* remove trailing '&' */
	{
	    ampersent = TRUE;
	    *p = ' ';
	}
	STRCAT(command, ">");
    }
    else
    {
	if (flags & EW_NOTFOUND)
	    STRCPY(command, "set nonomatch; ");
	else
	    STRCPY(command, "unset nonomatch; ");
	if (shell_style == STYLE_GLOB)
	    STRCAT(command, "glob >");
	else if (shell_style == STYLE_PRINT)
	    STRCAT(command, "print -N >");
	else if (shell_style == STYLE_VIMGLOB)
	    STRCAT(command, sh_vimglob_func);
	else
	    STRCAT(command, "echo >");
    }

    STRCAT(command, tempname);

    if (shell_style != STYLE_BT)
	for (i = 0; i < num_pat; ++i)
	{
	    /* When using system() always add extra quotes, because the shell
	     * is started twice.  Otherwise put a backslash before special
	     * characters, except inside ``. */
#ifdef USE_SYSTEM
	    STRCAT(command, " \"");
	    STRCAT(command, pat[i]);
	    STRCAT(command, "\"");
#else
	    int intick = FALSE;

	    p = command + STRLEN(command);
	    *p++ = ' ';
	    for (j = 0; pat[i][j] != NUL; ++j)
	    {
		if (pat[i][j] == '`')
		    intick = !intick;
		else if (pat[i][j] == '\\' && pat[i][j + 1] != NUL)
		{
		    /* Remove a backslash, take char literally.  But keep
		     * backslash inside backticks, before a special character
		     * and before a backtick. */
		    if (intick
			  || vim_strchr(SHELL_SPECIAL, pat[i][j + 1]) != NULL
			  || pat[i][j + 1] == '`')
			*p++ = '\\';
		    ++j;
		}
		else if (!intick && vim_strchr(SHELL_SPECIAL,
							   pat[i][j]) != NULL)
		    /* Put a backslash before a special character, but not
		     * when inside ``. */
		    *p++ = '\\';

		/* Copy one character. */
		*p++ = pat[i][j];
	    }
	    *p = NUL;
#endif
	}
    if (flags & EW_SILENT)
	show_shell_mess = FALSE;
    if (ampersent)
	STRCAT(command, "&");		/* put the '&' after the redirection */

    /*
     * Using zsh -G: If a pattern has no matches, it is just deleted from
     * the argument list, otherwise zsh gives an error message and doesn't
     * expand any other pattern.
     */
    if (shell_style == STYLE_PRINT)
	extra_shell_arg = (char_u *)"-G";   /* Use zsh NULL_GLOB option */

    /*
     * If we use -f then shell variables set in .cshrc won't get expanded.
     * vi can do it, so we will too, but it is only necessary if there is a "$"
     * in one of the patterns, otherwise we can still use the fast option.
     */
    else if (shell_style == STYLE_GLOB && !have_dollars(num_pat, pat))
	extra_shell_arg = (char_u *)"-f";	/* Use csh fast option */

    /*
     * execute the shell command
     */
    i = call_shell(command, SHELL_EXPAND | SHELL_SILENT);

    /* When running in the background, give it some time to create the temp
     * file, but don't wait for it to finish. */
    if (ampersent)
	mch_delay(10L, TRUE);

    extra_shell_arg = NULL;		/* cleanup */
    show_shell_mess = TRUE;
    vim_free(command);

    if (i != 0)				/* mch_call_shell() failed */
    {
	mch_remove(tempname);
	vim_free(tempname);
	/*
	 * With interactive completion, the error message is not printed.
	 * However with USE_SYSTEM, I don't know how to turn off error messages
	 * from the shell, so screen may still get messed up -- webb.
	 */
#ifndef USE_SYSTEM
	if (!(flags & EW_SILENT))
#endif
	{
	    redraw_later_clear();	/* probably messed up screen */
	    msg_putchar('\n');		/* clear bottom line quickly */
	    cmdline_row = Rows - 1;	/* continue on last line */
#ifdef USE_SYSTEM
	    if (!(flags & EW_SILENT))
#endif
	    {
		MSG(_(e_wildexpand));
		msg_start();		/* don't overwrite this message */
	    }
	}
	/* If a `cmd` expansion failed, don't list `cmd` as a match, even when
	 * EW_NOTFOUND is given */
	if (shell_style == STYLE_BT)
	    return FAIL;
	goto notfound;
    }

    /*
     * read the names from the file into memory
     */
    fd = fopen((char *)tempname, READBIN);
    if (fd == NULL)
    {
	/* Something went wrong, perhaps a file name with a special char. */
	if (!(flags & EW_SILENT))
	{
	    MSG(_(e_wildexpand));
	    msg_start();		/* don't overwrite this message */
	}
	vim_free(tempname);
	goto notfound;
    }
    fseek(fd, 0L, SEEK_END);
    len = ftell(fd);			/* get size of temp file */
    fseek(fd, 0L, SEEK_SET);
    buffer = alloc(len + 1);
    if (buffer == NULL)
    {
	/* out of memory */
	mch_remove(tempname);
	vim_free(tempname);
	fclose(fd);
	return FAIL;
    }
    i = fread((char *)buffer, 1, len, fd);
    fclose(fd);
    mch_remove(tempname);
    if (i != (int)len)
    {
	/* unexpected read error */
	EMSG2(_(e_notread), tempname);
	vim_free(tempname);
	vim_free(buffer);
	return FAIL;
    }
    vim_free(tempname);

# if defined(__CYGWIN__) || defined(__CYGWIN32__)
    /* Translate <CR><NL> into <NL>.  Caution, buffer may contain NUL. */
    p = buffer;
    for (i = 0; i < (int)len; ++i)
	if (!(buffer[i] == CAR && buffer[i + 1] == NL))
	    *p++ = buffer[i];
    len = p - buffer;
# endif


    /* file names are separated with Space */
    if (shell_style == STYLE_ECHO)
    {
	buffer[len] = '\n';		/* make sure the buffer ends in NL */
	p = buffer;
	for (i = 0; *p != '\n'; ++i)	/* count number of entries */
	{
	    while (*p != ' ' && *p != '\n')
		++p;
	    p = skipwhite(p);		/* skip to next entry */
	}
    }
    /* file names are separated with NL */
    else if (shell_style == STYLE_BT || shell_style == STYLE_VIMGLOB)
    {
	buffer[len] = NUL;		/* make sure the buffer ends in NUL */
	p = buffer;
	for (i = 0; *p != NUL; ++i)	/* count number of entries */
	{
	    while (*p != '\n' && *p != NUL)
		++p;
	    if (*p != NUL)
		++p;
	    p = skipwhite(p);		/* skip leading white space */
	}
    }
    /* file names are separated with NUL */
    else
    {
	/*
	 * Some versions of zsh use spaces instead of NULs to separate
	 * results.  Only do this when there is no NUL before the end of the
	 * buffer, otherwise we would never be able to use file names with
	 * embedded spaces when zsh does use NULs.
	 * When we found a NUL once, we know zsh is OK, set did_find_nul and
	 * don't check for spaces again.
	 */
	check_spaces = FALSE;
	if (shell_style == STYLE_PRINT && !did_find_nul)
	{
	    /* If there is a NUL, set did_find_nul, else set check_spaces */
	    buffer[len] = NUL;
	    if (len && (int)STRLEN(buffer) < (int)len - 1)
		did_find_nul = TRUE;
	    else
		check_spaces = TRUE;
	}

	/*
	 * Make sure the buffer ends with a NUL.  For STYLE_PRINT there
	 * already is one, for STYLE_GLOB it needs to be added.
	 */
	if (len && buffer[len - 1] == NUL)
	    --len;
	else
	    buffer[len] = NUL;
	i = 0;
	for (p = buffer; p < buffer + len; ++p)
	    if (*p == NUL || (*p == ' ' && check_spaces))   /* count entry */
	    {
		++i;
		*p = NUL;
	    }
	if (len)
	    ++i;			/* count last entry */
    }
    if (i == 0)
    {
	/*
	 * Can happen when using /bin/sh and typing ":e $NO_SUCH_VAR^I".
	 * /bin/sh will happily expand it to nothing rather than returning an
	 * error; and hey, it's good to check anyway -- webb.
	 */
	vim_free(buffer);
	goto notfound;
    }
    *num_file = i;
    *file = (char_u **)alloc(sizeof(char_u *) * i);
    if (*file == NULL)
    {
	/* out of memory */
	vim_free(buffer);
	return FAIL;
    }

    /*
     * Isolate the individual file names.
     */
    p = buffer;
    for (i = 0; i < *num_file; ++i)
    {
	(*file)[i] = p;
	/* Space or NL separates */
	if (shell_style == STYLE_ECHO || shell_style == STYLE_BT
					      || shell_style == STYLE_VIMGLOB)
	{
	    while (!(shell_style == STYLE_ECHO && *p == ' ')
						   && *p != '\n' && *p != NUL)
		++p;
	    if (p == buffer + len)		/* last entry */
		*p = NUL;
	    else
	    {
		*p++ = NUL;
		p = skipwhite(p);		/* skip to next entry */
	    }
	}
	else		/* NUL separates */
	{
	    while (*p && p < buffer + len)	/* skip entry */
		++p;
	    ++p;				/* skip NUL */
	}
    }

    /*
     * Move the file names to allocated memory.
     */
    for (j = 0, i = 0; i < *num_file; ++i)
    {
	/* Require the files to exist.	Helps when using /bin/sh */
	if (!(flags & EW_NOTFOUND) && mch_getperm((*file)[i]) < 0)
	    continue;

	/* check if this entry should be included */
	dir = (mch_isdir((*file)[i]));
	if ((dir && !(flags & EW_DIR)) || (!dir && !(flags & EW_FILE)))
	    continue;

	/* Skip files that are not executable if we check for that. */
	if (!dir && (flags & EW_EXEC) && !mch_can_exe((*file)[i]))
	    continue;

	p = alloc((unsigned)(STRLEN((*file)[i]) + 1 + dir));
	if (p)
	{
	    STRCPY(p, (*file)[i]);
	    if (dir)
		add_pathsep(p);	    /* add '/' to a directory name */
	    (*file)[j++] = p;
	}
    }
    vim_free(buffer);
    *num_file = j;

    if (*num_file == 0)	    /* rejected all entries */
    {
	vim_free(*file);
	*file = NULL;
	goto notfound;
    }

    return OK;

notfound:
    if (flags & EW_NOTFOUND)
	return save_patterns(num_pat, pat, num_file, file);
    return FAIL;
}


    static int
save_patterns(num_pat, pat, num_file, file)
    int		num_pat;
    char_u	**pat;
    int		*num_file;
    char_u	***file;
{
    int		i;
    char_u	*s;

    *file = (char_u **)alloc(num_pat * sizeof(char_u *));
    if (*file == NULL)
	return FAIL;
    for (i = 0; i < num_pat; i++)
    {
	s = vim_strsave(pat[i]);
	if (s != NULL)
	    /* Be compatible with expand_filename(): halve the number of
	     * backslashes. */
	    backslash_halve(s);
	(*file)[i] = s;
    }
    *num_file = num_pat;
    return OK;
}

/*
 * Return TRUE if the string "p" contains a wildcard that mch_expandpath() can
 * expand.
 */
    int
mch_has_exp_wildcard(p)
    char_u  *p;
{
    for ( ; *p; mb_ptr_adv(p))
    {
	if (*p == '\\' && p[1] != NUL)
	    ++p;
	else
	    if (vim_strchr((char_u *) "*?[{'" , *p) != NULL)
	    return TRUE;
    }
    return FALSE;
}

/*
 * Return TRUE if the string "p" contains a wildcard.
 * Don't recognize '~' at the end as a wildcard.
 */
    int
mch_has_wildcard(p)
    char_u  *p;
{
    for ( ; *p; mb_ptr_adv(p))
    {
	if (*p == '\\' && p[1] != NUL)
	    ++p;
	else
	    if (vim_strchr((char_u *) "*?[{`'$" , *p) != NULL
		|| (*p == '~' && p[1] != NUL))
	    return TRUE;
    }
    return FALSE;
}

    static int
have_wildcard(num, file)
    int	    num;
    char_u  **file;
{
    int	    i;

    for (i = 0; i < num; i++)
	if (mch_has_wildcard(file[i]))
	    return 1;
    return 0;
}

    static int
have_dollars(num, file)
    int	    num;
    char_u  **file;
{
    int	    i;

    for (i = 0; i < num; i++)
	if (vim_strchr(file[i], '$') != NULL)
	    return TRUE;
    return FALSE;
}

#ifndef HAVE_RENAME
/*
 * Scaled-down version of rename(), which is missing in Xenix.
 * This version can only move regular files and will fail if the
 * destination exists.
 */
    int
mch_rename(src, dest)
    const char *src, *dest;
{
    struct stat	    st;

    if (stat(dest, &st) >= 0)	    /* fail if destination exists */
	return -1;
    if (link(src, dest) != 0)	    /* link file to new name */
	return -1;
    if (mch_remove(src) == 0)	    /* delete link to old name */
	return 0;
    return -1;
}
#endif /* !HAVE_RENAME */

#if defined(FEAT_LIBCALL) || defined(PROTO)
typedef char_u * (*STRPROCSTR)__ARGS((char_u *));
typedef char_u * (*INTPROCSTR)__ARGS((int));
typedef int (*STRPROCINT)__ARGS((char_u *));
typedef int (*INTPROCINT)__ARGS((int));

/*
 * Call a DLL routine which takes either a string or int param
 * and returns an allocated string.
 */
    int
mch_libcall(libname, funcname, argstring, argint, string_result, number_result)
    char_u	*libname;
    char_u	*funcname;
    char_u	*argstring;	/* NULL when using a argint */
    int		argint;
    char_u	**string_result;/* NULL when using number_result */
    int		*number_result;
{
# if defined(USE_DLOPEN)
    void	*hinstLib;
    char	*dlerr = NULL;
# else
    shl_t	hinstLib;
# endif
    STRPROCSTR	ProcAdd;
    INTPROCSTR	ProcAddI;
    char_u	*retval_str = NULL;
    int		retval_int = 0;
    int		success = FALSE;

    /*
     * Get a handle to the DLL module.
     */
# if defined(USE_DLOPEN)
    /* First clear any error, it's not cleared by the dlopen() call. */
    (void)dlerror();

    hinstLib = dlopen((char *)libname, RTLD_LAZY
#  ifdef RTLD_LOCAL
	    | RTLD_LOCAL
#  endif
	    );
    if (hinstLib == NULL)
    {
	/* "dlerr" must be used before dlclose() */
	dlerr = (char *)dlerror();
	if (dlerr != NULL)
	    EMSG2(_("dlerror = \"%s\""), dlerr);
    }
# else
    hinstLib = shl_load((const char*)libname, BIND_IMMEDIATE|BIND_VERBOSE, 0L);
# endif

    /* If the handle is valid, try to get the function address. */
    if (hinstLib != NULL)
    {
# ifdef HAVE_SETJMP_H
	/*
	 * Catch a crash when calling the library function.  For example when
	 * using a number where a string pointer is expected.
	 */
	mch_startjmp();
	if (SETJMP(lc_jump_env) != 0)
	{
	    success = FALSE;
#  if defined(USE_DLOPEN)
	    dlerr = NULL;
#  endif
	    mch_didjmp();
	}
	else
# endif
	{
	    retval_str = NULL;
	    retval_int = 0;

	    if (argstring != NULL)
	    {
# if defined(USE_DLOPEN)
		ProcAdd = (STRPROCSTR)dlsym(hinstLib, (const char *)funcname);
		dlerr = (char *)dlerror();
# else
		if (shl_findsym(&hinstLib, (const char *)funcname,
					TYPE_PROCEDURE, (void *)&ProcAdd) < 0)
		    ProcAdd = NULL;
# endif
		if ((success = (ProcAdd != NULL
# if defined(USE_DLOPEN)
			    && dlerr == NULL
# endif
			    )))
		{
		    if (string_result == NULL)
			retval_int = ((STRPROCINT)ProcAdd)(argstring);
		    else
			retval_str = (ProcAdd)(argstring);
		}
	    }
	    else
	    {
# if defined(USE_DLOPEN)
		ProcAddI = (INTPROCSTR)dlsym(hinstLib, (const char *)funcname);
		dlerr = (char *)dlerror();
# else
		if (shl_findsym(&hinstLib, (const char *)funcname,
				       TYPE_PROCEDURE, (void *)&ProcAddI) < 0)
		    ProcAddI = NULL;
# endif
		if ((success = (ProcAddI != NULL
# if defined(USE_DLOPEN)
			    && dlerr == NULL
# endif
			    )))
		{
		    if (string_result == NULL)
			retval_int = ((INTPROCINT)ProcAddI)(argint);
		    else
			retval_str = (ProcAddI)(argint);
		}
	    }

	    /* Save the string before we free the library. */
	    /* Assume that a "1" or "-1" result is an illegal pointer. */
	    if (string_result == NULL)
		*number_result = retval_int;
	    else if (retval_str != NULL
		    && retval_str != (char_u *)1
		    && retval_str != (char_u *)-1)
		*string_result = vim_strsave(retval_str);
	}

# ifdef HAVE_SETJMP_H
	mch_endjmp();
#  ifdef SIGHASARG
	if (lc_signal != 0)
	{
	    int i;

	    /* try to find the name of this signal */
	    for (i = 0; signal_info[i].sig != -1; i++)
		if (lc_signal == signal_info[i].sig)
		    break;
	    EMSG2("E368: got SIG%s in libcall()", signal_info[i].name);
	}
#  endif
# endif

# if defined(USE_DLOPEN)
	/* "dlerr" must be used before dlclose() */
	if (dlerr != NULL)
	    EMSG2(_("dlerror = \"%s\""), dlerr);

	/* Free the DLL module. */
	(void)dlclose(hinstLib);
# else
	(void)shl_unload(hinstLib);
# endif
    }

    if (!success)
    {
	EMSG2(_(e_libcall), funcname);
	return FAIL;
    }

    return OK;
}
#endif

