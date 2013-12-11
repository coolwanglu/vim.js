/*
 * os_browser.c : provide OS interface with emscripten API
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
#include "vimjs.h"

#include "os_unixx.h"	    /* unix includes for os_unix.c only */


/*
 * end of autoconf section. To be extended...
 */

/* Are the following #ifdefs still required? And why? Is that for X11? */

static void may_core_dump __ARGS((void));

#ifdef HAVE_UNION_WAIT
typedef union wait waitstatus;
#else
typedef int waitstatus;
#endif

static int  RealWaitForChar __ARGS((int, long, int *));

#if defined(SIGINT)
static RETSIGTYPE catch_sigint __ARGS(SIGPROTOARG);
#endif
#if defined(SIGPWR)
static RETSIGTYPE catch_sigpwr __ARGS(SIGPROTOARG);
#endif
#if defined(SIGALRM) && defined(FEAT_X11) \
	&& defined(FEAT_TITLE) && !defined(FEAT_GUI_GTK)
# define SET_SIG_ALARM
static RETSIGTYPE sig_alarm __ARGS(SIGPROTOARG);
/* volatile because it is used in signal handler sig_alarm(). */
static volatile int sig_alarm_called;
#endif
static RETSIGTYPE deathtrap __ARGS(SIGPROTOARG);

static void catch_int_signal __ARGS((void));
static void set_signals __ARGS((void));
static void catch_signals __ARGS((RETSIGTYPE (*func_deadly)(), RETSIGTYPE (*func_other)()));
#ifndef __EMX__
static int  have_wildcard __ARGS((int, char_u **));
static int  have_dollars __ARGS((int, char_u **));
#endif

#ifndef __EMX__
static int save_patterns __ARGS((int num_pat, char_u **pat, int *num_file, char_u ***file));
#endif

#ifndef SIG_ERR
# define SIG_ERR	((RETSIGTYPE (*)())-1)
#endif

#ifndef __EMX__
static char_u	*extra_shell_arg = NULL;
static int	show_shell_mess = TRUE;
#endif
/* volatile because it is used in signal handler deathtrap(). */
static volatile int deadly_signal = 0;	    /* The signal we caught */
/* volatile because it is used in signal handler deathtrap(). */
static volatile int in_mch_delay = FALSE;    /* sleeping in mch_delay() */

static int curr_tmode = TMODE_COOK;	/* contains current terminal mode */

#ifdef SYS_SIGLIST_DECLARED
/*
 * I have seen
 *  extern char *_sys_siglist[NSIG];
 * on Irix, Linux, NetBSD and Solaris. It contains a nice list of strings
 * that describe the signals. That is nearly what we want here.  But
 * autoconf does only check for sys_siglist (without the underscore), I
 * do not want to change everything today.... jw.
 * This is why AC_DECL_SYS_SIGLIST is commented out in configure.in
 */
#endif

static struct signalinfo
{
    int	    sig;	/* Signal number, eg. SIGSEGV etc */
    char    *name;	/* Signal name (not char_u!). */
    char    deadly;	/* Catch as a deadly signal? */
} signal_info[] =
{
#ifdef SIGHUP
    {SIGHUP,	    "HUP",	TRUE},
#endif
#ifdef SIGQUIT
    {SIGQUIT,	    "QUIT",	TRUE},
#endif
#ifdef SIGILL
    {SIGILL,	    "ILL",	TRUE},
#endif
#ifdef SIGTRAP
    {SIGTRAP,	    "TRAP",	TRUE},
#endif
#ifdef SIGABRT
    {SIGABRT,	    "ABRT",	TRUE},
#endif
#ifdef SIGEMT
    {SIGEMT,	    "EMT",	TRUE},
#endif
#ifdef SIGFPE
    {SIGFPE,	    "FPE",	TRUE},
#endif
#ifdef SIGBUS
    {SIGBUS,	    "BUS",	TRUE},
#endif
#if defined(SIGSEGV)
    /* MzScheme uses SEGV in its garbage collector */
    {SIGSEGV,	    "SEGV",	TRUE},
#endif
#ifdef SIGSYS
    {SIGSYS,	    "SYS",	TRUE},
#endif
#ifdef SIGALRM
    {SIGALRM,	    "ALRM",	FALSE},	/* Perl's alarm() can trigger it */
#endif
#ifdef SIGTERM
    {SIGTERM,	    "TERM",	TRUE},
#endif
#if defined(SIGVTALRM) && !defined(FEAT_RUBY)
    {SIGVTALRM,	    "VTALRM",	TRUE},
#endif
#if defined(SIGPROF) && !defined(WE_ARE_PROFILING)
    /* MzScheme uses SIGPROF for its own needs; On Linux with profiling
     * this makes Vim exit.  WE_ARE_PROFILING is defined in Makefile.  */
    {SIGPROF,	    "PROF",	TRUE},
#endif
#ifdef SIGXCPU
    {SIGXCPU,	    "XCPU",	TRUE},
#endif
#ifdef SIGXFSZ
    {SIGXFSZ,	    "XFSZ",	TRUE},
#endif
#ifdef SIGUSR1
    {SIGUSR1,	    "USR1",	TRUE},
#endif
#if defined(SIGUSR2) && !defined(FEAT_SYSMOUSE)
    /* Used for sysmouse handling */
    {SIGUSR2,	    "USR2",	TRUE},
#endif
#ifdef SIGINT
    {SIGINT,	    "INT",	FALSE},
#endif
#ifdef SIGWINCH
    {SIGWINCH,	    "WINCH",	FALSE},
#endif
#ifdef SIGTSTP
    {SIGTSTP,	    "TSTP",	FALSE},
#endif
#ifdef SIGPIPE
    {SIGPIPE,	    "PIPE",	FALSE},
#endif
    {-1,	    "Unknown!", FALSE}
};

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
# ifdef VMS
    return chdir(vms_fixfilename(path));
# else
    return chdir(path);
# endif
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
# ifdef __EMX__
    return ulimit(3, 0L) >> 10;   /* always 32MB? */
# else
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
# endif
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
    in_mch_delay = TRUE;
    old_tmode = curr_tmode;
    if (curr_tmode == TMODE_RAW)
        settmode(TMODE_SLEEP);

    vimjs_sleep(msec);

    settmode(old_tmode);
    in_mch_delay = FALSE;
}

#if defined(HAVE_STACK_LIMIT) \
	|| (!defined(HAVE_SIGALTSTACK) && defined(HAVE_SIGSTACK))
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

#if defined(_THREAD_SAFE) && defined(HAVE_PTHREAD_NP_H)
# include <pthread.h>
# include <pthread_np.h>
#endif

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
#if defined(_THREAD_SAFE) && defined(HAVE_PTHREAD_NP_H)
	{
	    pthread_attr_t  attr;
	    size_t	    size;

	    /* On FreeBSD the initial thread always has a fixed stack size, no
	     * matter what the limits are set to.  Normally it's 1 Mbyte. */
	    pthread_attr_init(&attr);
	    if (pthread_attr_get_np(pthread_self(), &attr) == 0)
	    {
		pthread_attr_getstacksize(&attr, &size);
		if (lim > (long)size)
		    lim = (long)size;
	    }
	    pthread_attr_destroy(&attr);
	}
#endif
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

#if defined(HAVE_SIGALTSTACK) || defined(HAVE_SIGSTACK)
/*
 * Support for using the signal stack.
 * This helps when we run out of stack space, which causes a SIGSEGV.  The
 * signal handler then must run on another stack, since the normal stack is
 * completely full.
 */

#if defined(HAVE_AVAILABILITYMACROS_H)
# include <AvailabilityMacros.h>
#endif

#ifndef SIGSTKSZ
# define SIGSTKSZ 8000    /* just a guess of how much stack is needed... */
#endif

# ifdef HAVE_SIGALTSTACK
static stack_t sigstk;			/* for sigaltstack() */
# else
static struct sigstack sigstk;		/* for sigstack() */
# endif

static void init_signal_stack __ARGS((void));
static char *signal_stack;

    static void
init_signal_stack()
{
    if (signal_stack != NULL)
    {
# ifdef HAVE_SIGALTSTACK
#  if defined(__APPLE__) && (!defined(MAC_OS_X_VERSION_MAX_ALLOWED) \
		|| MAC_OS_X_VERSION_MAX_ALLOWED <= 1040)
	/* missing prototype.  Adding it to osdef?.h.in doesn't work, because
	 * "struct sigaltstack" needs to be declared. */
	extern int sigaltstack __ARGS((const struct sigaltstack *ss, struct sigaltstack *oss));
#  endif

#  ifdef HAVE_SS_BASE
	sigstk.ss_base = signal_stack;
#  else
	sigstk.ss_sp = signal_stack;
#  endif
	sigstk.ss_size = SIGSTKSZ;
	sigstk.ss_flags = 0;
	(void)sigaltstack(&sigstk, NULL);
# else
	sigstk.ss_sp = signal_stack;
	if (stack_grows_downwards)
	    sigstk.ss_sp += SIGSTKSZ - 1;
	sigstk.ss_onstack = 0;
	(void)sigstack(&sigstk, NULL);
# endif
    }
}
#endif


#if defined(SIGINT)
    static RETSIGTYPE
catch_sigint SIGDEFARG(sigarg)
{
    /* this is not required on all systems, but it doesn't hurt anybody */
    signal(SIGINT, (RETSIGTYPE (*)())catch_sigint);
    got_int = TRUE;
    SIGRETURN;
}
#endif

#if defined(SIGPWR)
    static RETSIGTYPE
catch_sigpwr SIGDEFARG(sigarg)
{
    /* this is not required on all systems, but it doesn't hurt anybody */
    signal(SIGPWR, (RETSIGTYPE (*)())catch_sigpwr);
    /*
     * I'm not sure we get the SIGPWR signal when the system is really going
     * down or when the batteries are almost empty.  Just preserve the swap
     * files and don't exit, that can't do any harm.
     */
    ml_sync_all(FALSE, FALSE);
    SIGRETURN;
}
#endif

#ifdef SET_SIG_ALARM
/*
 * signal function for alarm().
 */
    static RETSIGTYPE
sig_alarm SIGDEFARG(sigarg)
{
    /* doesn't do anything, just to break a system call */
    sig_alarm_called = TRUE;
    SIGRETURN;
}
#endif

#if (defined(HAVE_SETJMP_H) \
	&& defined(FEAT_LIBCALL)) \
    || defined(PROTO)
/*
 * A simplistic version of setjmp() that only allows one level of using.
 * Don't call twice before calling mch_endjmp()!.
 * Usage:
 *	mch_startjmp();
 *	if (SETJMP(lc_jump_env) != 0)
 *	{
 *	    mch_didjmp();
 *	    EMSG("crash!");
 *	}
 *	else
 *	{
 *	    do_the_work;
 *	    mch_endjmp();
 *	}
 * Note: Can't move SETJMP() here, because a function calling setjmp() must
 * not return before the saved environment is used.
 * Returns OK for normal return, FAIL when the protected code caused a
 * problem and LONGJMP() was used.
 */
    void
mch_startjmp()
{
#ifdef SIGHASARG
    lc_signal = 0;
#endif
    lc_active = TRUE;
}

    void
mch_endjmp()
{
    lc_active = FALSE;
}

    void
mch_didjmp()
{
# if defined(HAVE_SIGALTSTACK) || defined(HAVE_SIGSTACK)
    /* On FreeBSD the signal stack has to be reset after using siglongjmp(),
     * otherwise catching the signal only works once. */
    init_signal_stack();
# endif
}
#endif

/*
 * This function handles deadly signals.
 * It tries to preserve any swap files and exit properly.
 * (partly from Elvis).
 * NOTE: Avoid unsafe functions, such as allocating memory, they can result in
 * a deadlock.
 */
    static RETSIGTYPE
deathtrap SIGDEFARG(sigarg)
{
    static int	entered = 0;	    /* count the number of times we got here.
				       Note: when memory has been corrupted
				       this may get an arbitrary value! */
#ifdef SIGHASARG
    int		i;
#endif

#if defined(HAVE_SETJMP_H)
    /*
     * Catch a crash in protected code.
     * Restores the environment saved in lc_jump_env, which looks like
     * SETJMP() returns 1.
     */
    if (lc_active)
    {
# if defined(SIGHASARG)
	lc_signal = sigarg;
# endif
	lc_active = FALSE;	/* don't jump again */
	LONGJMP(lc_jump_env, 1);
	/* NOTREACHED */
    }
#endif

#ifdef SIGHASARG
# ifdef SIGQUIT
    /* While in mch_delay() we go to cooked mode to allow a CTRL-C to
     * interrupt us.  But in cooked mode we may also get SIGQUIT, e.g., when
     * pressing CTRL-\, but we don't want Vim to exit then. */
    if (in_mch_delay && sigarg == SIGQUIT)
	SIGRETURN;
# endif

    /* When SIGHUP, SIGQUIT, etc. are blocked: postpone the effect and return
     * here.  This avoids that a non-reentrant function is interrupted, e.g.,
     * free().  Calling free() again may then cause a crash. */
    if (entered == 0
	    && (0
# ifdef SIGHUP
		|| sigarg == SIGHUP
# endif
# ifdef SIGQUIT
		|| sigarg == SIGQUIT
# endif
# ifdef SIGTERM
		|| sigarg == SIGTERM
# endif
# ifdef SIGPWR
		|| sigarg == SIGPWR
# endif
# ifdef SIGUSR1
		|| sigarg == SIGUSR1
# endif
# ifdef SIGUSR2
		|| sigarg == SIGUSR2
# endif
		)
	    && !vim_handle_signal(sigarg))
	SIGRETURN;
#endif

    /* Remember how often we have been called. */
    ++entered;

#ifdef FEAT_EVAL
    /* Set the v:dying variable. */
    set_vim_var_nr(VV_DYING, (long)entered);
#endif

#ifdef HAVE_STACK_LIMIT
    /* Since we are now using the signal stack, need to reset the stack
     * limit.  Otherwise using a regexp will fail. */
    get_stack_limit();
#endif

#if 0
    /* This is for opening gdb the moment Vim crashes.
     * You need to manually adjust the file name and Vim executable name.
     * Suggested by SungHyun Nam. */
    {
# define VI_GDB_FILE "/tmp/vimgdb"
# define VIM_NAME "/usr/bin/vim"
	FILE *fp = fopen(VI_GDB_FILE, "w");
	if (fp)
	{
	    fprintf(fp,
		    "file %s\n"
		    "attach %d\n"
		    "set height 1000\n"
		    "bt full\n"
		    , VIM_NAME, getpid());
	    fclose(fp);
	    system("xterm -e gdb -x "VI_GDB_FILE);
	    unlink(VI_GDB_FILE);
	}
    }
#endif

#ifdef SIGHASARG
    /* try to find the name of this signal */
    for (i = 0; signal_info[i].sig != -1; i++)
	if (sigarg == signal_info[i].sig)
	    break;
    deadly_signal = sigarg;
#endif

    full_screen = FALSE;	/* don't write message to the GUI, it might be
				 * part of the problem... */
    /*
     * If something goes wrong after entering here, we may get here again.
     * When this happens, give a message and try to exit nicely (resetting the
     * terminal mode, etc.)
     * When this happens twice, just exit, don't even try to give a message,
     * stack may be corrupt or something weird.
     * When this still happens again (or memory was corrupted in such a way
     * that "entered" was clobbered) use _exit(), don't try freeing resources.
     */
    if (entered >= 3)
    {
	reset_signals();	/* don't catch any signals anymore */
	may_core_dump();
	if (entered >= 4)
	    _exit(8);
	exit(7);
    }
    if (entered == 2)
    {
	/* No translation, it may call malloc(). */
	OUT_STR("Vim: Double signal, exiting\n");
	out_flush();
	getout(1);
    }

    /* No translation, it may call malloc(). */
#ifdef SIGHASARG
    sprintf((char *)IObuff, "Vim: Caught deadly signal %s\n",
							 signal_info[i].name);
#else
    sprintf((char *)IObuff, "Vim: Caught deadly signal\n");
#endif

    /* Preserve files and exit.  This sets the really_exiting flag to prevent
     * calling free(). */
    preserve_exit();

#ifdef NBDEBUG
    reset_signals();
    may_core_dump();
    abort();
#endif

    SIGRETURN;
}

#if defined(_REENTRANT) && defined(SIGCONT)
/*
 * On Solaris with multi-threading, suspending might not work immediately.
 * Catch the SIGCONT signal, which will be used as an indication whether the
 * suspending has been done or not.
 *
 * On Linux, signal is not always handled immediately either.
 * See https://bugs.launchpad.net/bugs/291373
 *
 * volatile because it is used in signal handler sigcont_handler().
 */
static volatile int sigcont_received;
static RETSIGTYPE sigcont_handler __ARGS(SIGPROTOARG);

/*
 * signal handler for SIGCONT
 */
    static RETSIGTYPE
sigcont_handler SIGDEFARG(sigarg)
{
    sigcont_received = TRUE;
    SIGRETURN;
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
    /* BeOS does have SIGTSTP, but it doesn't work. */
#if defined(SIGTSTP) && !defined(__BEOS__)
    out_flush();	    /* needed to make cursor visible on some systems */
    settmode(TMODE_COOK);
    out_flush();	    /* needed to disable mouse on some systems */

# if defined(FEAT_CLIPBOARD) && defined(FEAT_X11)
    loose_clipboard();
# endif

# if defined(_REENTRANT) && defined(SIGCONT)
    sigcont_received = FALSE;
# endif
    kill(0, SIGTSTP);	    /* send ourselves a STOP signal */
# if defined(_REENTRANT) && defined(SIGCONT)
    /*
     * Wait for the SIGCONT signal to be handled. It generally happens
     * immediately, but somehow not all the time. Do not call pause()
     * because there would be race condition which would hang Vim if
     * signal happened in between the test of sigcont_received and the
     * call to pause(). If signal is not yet received, call sleep(0)
     * to just yield CPU. Signal should then be received. If somehow
     * it's still not received, sleep 1, 2, 3 ms. Don't bother waiting
     * further if signal is not received after 1+2+3+4 ms (not expected
     * to happen).
     */
    {
	long wait_time;
	for (wait_time = 0; !sigcont_received && wait_time <= 3L; wait_time++)
	    /* Loop is not entered most of the time */
	    mch_delay(wait_time, FALSE);
    }
# endif

# ifdef FEAT_TITLE
    /*
     * Set oldtitle to NULL, so the current title is obtained again.
     */
    vim_free(oldtitle);
    oldtitle = NULL;
# endif
    settmode(TMODE_RAW);
    need_check_timestamps = TRUE;
    did_check_timestamps = FALSE;
#else
    suspend_shell();
#endif
}

    void
mch_init()
{
    Columns = 80;
    Rows = 24;

    out_flush();
    set_signals();

#ifdef MACOS_CONVERT
    mac_conv_init();
#endif
#ifdef FEAT_CYGWIN_WIN32_CLIPBOARD
    win_clip_init();
#endif
}

    static void
set_signals()
{

    /*
     * We want the STOP signal to work, to make mch_suspend() work.
     * For "rvim" the STOP signal is ignored.
     */
#ifdef SIGTSTP
    signal(SIGTSTP, restricted ? SIG_IGN : SIG_DFL);
#endif
#if defined(_REENTRANT) && defined(SIGCONT)
    signal(SIGCONT, sigcont_handler);
#endif

    /*
     * We want to ignore breaking of PIPEs.
     */
#ifdef SIGPIPE
    signal(SIGPIPE, SIG_IGN);
#endif

#ifdef SIGINT
    catch_int_signal();
#endif

    /*
     * Ignore alarm signals (Perl's alarm() generates it).
     */
#ifdef SIGALRM
    signal(SIGALRM, SIG_IGN);
#endif

    /*
     * Catch SIGPWR (power failure?) to preserve the swap files, so that no
     * work will be lost.
     */
#ifdef SIGPWR
    signal(SIGPWR, (RETSIGTYPE (*)())catch_sigpwr);
#endif

    /*
     * Arrange for other signals to gracefully shutdown Vim.
     */
    catch_signals(deathtrap, SIG_ERR);

#if defined(FEAT_GUI) && defined(SIGHUP)
    /*
     * When the GUI is running, ignore the hangup signal.
     */
    if (gui.in_use)
	signal(SIGHUP, SIG_IGN);
#endif
}

#if defined(SIGINT) || defined(PROTO)
/*
 * Catch CTRL-C (only works while in Cooked mode).
 */
    static void
catch_int_signal()
{
    signal(SIGINT, (RETSIGTYPE (*)())catch_sigint);
}
#endif

    void
reset_signals()
{
    catch_signals(SIG_DFL, SIG_DFL);
#if defined(_REENTRANT) && defined(SIGCONT)
    /* SIGCONT isn't in the list, because its default action is ignore */
    signal(SIGCONT, SIG_DFL);
#endif
}

    static void
catch_signals(func_deadly, func_other)
    RETSIGTYPE (*func_deadly)();
    RETSIGTYPE (*func_other)();
{
    int	    i;

    for (i = 0; signal_info[i].sig != -1; i++)
	if (signal_info[i].deadly)
	{
#if defined(HAVE_SIGALTSTACK) && defined(HAVE_SIGACTION)
	    struct sigaction sa;

	    /* Setup to use the alternate stack for the signal function. */
	    sa.sa_handler = func_deadly;
	    sigemptyset(&sa.sa_mask);
# if defined(__linux__) && defined(_REENTRANT)
	    /* On Linux, with glibc compiled for kernel 2.2, there is a bug in
	     * thread handling in combination with using the alternate stack:
	     * pthread library functions try to use the stack pointer to
	     * identify the current thread, causing a SEGV signal, which
	     * recursively calls deathtrap() and hangs. */
	    sa.sa_flags = 0;
# else
	    sa.sa_flags = SA_ONSTACK;
# endif
	    sigaction(signal_info[i].sig, &sa, NULL);
#else
# if defined(HAVE_SIGALTSTACK) && defined(HAVE_SIGVEC)
	    struct sigvec sv;

	    /* Setup to use the alternate stack for the signal function. */
	    sv.sv_handler = func_deadly;
	    sv.sv_mask = 0;
	    sv.sv_flags = SV_ONSTACK;
	    sigvec(signal_info[i].sig, &sv, NULL);
# else
	    signal(signal_info[i].sig, func_deadly);
# endif
#endif
	}
	else if (func_other != SIG_ERR)
	    signal(signal_info[i].sig, func_other);
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
#ifdef SIGPWR
			     if (sig != SIGPWR)
#endif
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
#ifdef OS2
    /*
     * Store argv[0], may be used for $VIM.  Only use it if it is an absolute
     * name, mostly it's just "vim" and found in the path, which is unusable.
     */
    if (mch_isFullName(argv[0]))
	exe_name = vim_strsave((char_u *)argv[0]);
#endif
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

#ifdef FEAT_X11

# if defined(HAVE_GETTIMEOFDAY) && defined(HAVE_SYS_TIME_H) \
	&& defined(FEAT_TITLE)

static void xopen_message __ARGS((struct timeval *tvp));

/*
 * Give a message about the elapsed time for opening the X window.
 */
    static void
xopen_message(tvp)
    struct timeval *tvp;	/* must contain start time */
{
    struct timeval  end_tv;

    /* Compute elapsed time. */
    gettimeofday(&end_tv, NULL);
    smsg((char_u *)_("Opening the X display took %ld msec"),
	    (end_tv.tv_sec - tvp->tv_sec) * 1000L
				   + (end_tv.tv_usec - tvp->tv_usec) / 1000L);
}
# endif
#endif


#ifdef FEAT_TITLE


    static int
get_x11_title(test_only)
    int	    test_only UNUSED;
{
    return FALSE;
}

    static int
get_x11_icon(test_only)
    int	    test_only;
{
    if (!test_only)
    {
	if (STRNCMP(T_NAME, "builtin_", 8) == 0)
	    oldicon = vim_strsave(T_NAME + 8);
	else
	    oldicon = vim_strsave(T_NAME);
    }
    return FALSE;
}

    int
mch_can_restore_title()
{
    return get_x11_title(TRUE);
}

    int
mch_can_restore_icon()
{
    return get_x11_icon(TRUE);
}

/*
 * Set the window title and icon.
 */
    void
mch_settitle(title, icon)
    char_u *title;
    char_u *icon;
{
    int		type = 0;
    static int	recursive = 0;

    if (T_NAME == NULL)	    /* no terminal name (yet) */
	return;
    if (title == NULL && icon == NULL)	    /* nothing to do */
	return;

    /* When one of the X11 functions causes a deadly signal, we get here again
     * recursively.  Avoid hanging then (something is probably locked). */
    if (recursive)
	return;
    ++recursive;

    /*
     * if the window ID and the display is known, we may use X11 calls
     */
#ifdef FEAT_X11
    if (get_x11_windis() == OK)
	type = 1;
#else
# if defined(FEAT_GUI_PHOTON) || defined(FEAT_GUI_MAC) || defined(FEAT_GUI_GTK)
    if (gui.in_use)
	type = 1;
# endif
#endif

    /*
     * Note: if "t_ts" is set, title is set with escape sequence rather
     *	     than x11 calls, because the x11 calls don't always work
     */
    if ((type || *T_TS != NUL) && title != NULL)
    {
	if (oldtitle == NULL
#ifdef FEAT_GUI
		&& !gui.in_use
#endif
		)		/* first call but not in GUI, save title */
	    (void)get_x11_title(FALSE);

	if (*T_TS != NUL)		/* it's OK if t_fs is empty */
	    term_settitle(title);
#ifdef FEAT_X11
	else
# ifdef FEAT_GUI_GTK
	if (!gui.in_use)		/* don't do this if GTK+ is running */
# endif
	    set_x11_title(title);		/* x11 */
#endif
#if defined(FEAT_GUI_GTK) \
	|| defined(FEAT_GUI_PHOTON) || defined(FEAT_GUI_MAC)
	else
	    gui_mch_settitle(title, icon);
#endif
	did_set_title = TRUE;
    }

    if ((type || *T_CIS != NUL) && icon != NULL)
    {
	if (oldicon == NULL
#ifdef FEAT_GUI
		&& !gui.in_use
#endif
		)		/* first call, save icon */
	    get_x11_icon(FALSE);

	if (*T_CIS != NUL)
	{
	    out_str(T_CIS);			/* set icon start */
	    out_str_nf(icon);
	    out_str(T_CIE);			/* set icon end */
	    out_flush();
	}
#ifdef FEAT_X11
	else
# ifdef FEAT_GUI_GTK
	if (!gui.in_use)		/* don't do this if GTK+ is running */
# endif
	    set_x11_icon(icon);			/* x11 */
#endif
	did_set_icon = TRUE;
    }
    --recursive;
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
    /* only restore the title or icon when it has been set */
    mch_settitle(((which & 1) && did_set_title) ?
			(oldtitle ? oldtitle : p_titleold) : NULL,
			      ((which & 2) && did_set_icon) ? oldicon : NULL);
}

#endif /* FEAT_TITLE */

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
#ifdef VMS
    vim_strncpy(s, (char_u *)cuserid(NULL), len - 1);
    return OK;
#else
    return mch_get_uname(getuid(), s, len);
#endif
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
# ifdef VAXC
    vaxc$gethostname((char *)s, len);
# else
    gethostname((char *)s, len);
# endif
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

#if defined(OS2) || defined(PROTO)
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
#ifdef OS2
    int		only_drive;	/* file name is only a drive letter */
#endif
#ifdef HAVE_FCHDIR
    int		fd = -1;
    static int	dont_fchdir = FALSE;	/* TRUE when fchdir() doesn't work */
#endif
    char_u	olddir[MAXPATHL];
    char_u	*p;
    int		retval = OK;
#ifdef __CYGWIN__
    char_u	posix_fname[MAXPATHL];	/* Cygwin docs mention MAX_PATH, but
					   it's not always defined */
#endif

#ifdef VMS
    fname = vms_fixfilename(fname);
#endif

#ifdef __CYGWIN__
    /*
     * This helps for when "/etc/hosts" is a symlink to "c:/something/hosts".
     */
# if CYGWIN_VERSION_DLL_MAJOR >= 1007
    cygwin_conv_path(CCP_WIN_A_TO_POSIX, fname, posix_fname, MAXPATHL);
# else
    cygwin_conv_to_posix_path(fname, posix_fname);
# endif
    fname = posix_fname;
#endif

    /* expand it if forced or not an absolute path */
    if (force || !mch_isFullName(fname))
    {
	/*
	 * If the file name has a path, change to that directory for a moment,
	 * and then do the getwd() (and get back to where we were).
	 * This will get the correct path name with "../" things.
	 */
#ifdef OS2
	only_drive = 0;
	if (((p = vim_strrchr(fname, '/')) != NULL)
		|| ((p = vim_strrchr(fname, '\\')) != NULL)
		|| (((p = vim_strchr(fname,  ':')) != NULL) && ++only_drive))
#else
	if ((p = vim_strrchr(fname, '/')) != NULL)
#endif
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
#ifdef OS2
		/*
		 * compensate for case where ':' from "D:" was the only
		 * path separator detected in the file name; the _next_
		 * character has to be removed, and then restored later.
		 */
		if (only_drive)
		    p++;
#endif
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
#ifdef OS2
		if (only_drive)
		{
		    p--;
		    if (retval != FAIL)
			fname--;
		}
#endif
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
#ifndef VMS
	else if (l > 0 && buf[l - 1] != '/' && *fname != NUL
						   && STRCMP(fname, ".") != 0)
	    STRCAT(buf, "/");
#endif
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
#ifdef __EMX__
    return _fnisabs(fname);
#else
# ifdef VMS
    return ( fname[0] == '/'	       || fname[0] == '.'	    ||
	     strchr((char *)fname,':') || strchr((char *)fname,'"') ||
	    (strchr((char *)fname,'[') && strchr((char *)fname,']'))||
	    (strchr((char *)fname,'<') && strchr((char *)fname,'>'))   );
# else
    return (*fname == '/' || *fname == '~');
# endif
#endif
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
#ifdef VMS
    if (stat((char *)vms_fixfilename(name), &statb))
#else
    if (stat((char *)name, &statb))
#endif
	return -1;
#ifdef __INTERIX
    /* The top bit makes the value negative, which means the file doesn't
     * exist.  Remove the bit, we don't use it. */
    return statb.st_mode & ~S_ADDACE;
#else
    return statb.st_mode;
#endif
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
#ifdef VMS
		    vms_fixfilename(name),
#else
		    name,
#endif
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

#if defined(HAVE_SELINUX) || defined(PROTO)
/*
 * Copy security info from "from_file" to "to_file".
 */
    void
mch_copy_sec(from_file, to_file)
    char_u	*from_file;
    char_u	*to_file;
{
    if (from_file == NULL)
	return;

    if (selinux_enabled == -1)
	selinux_enabled = is_selinux_enabled();

    if (selinux_enabled > 0)
    {
	security_context_t from_context = NULL;
	security_context_t to_context = NULL;

	if (getfilecon((char *)from_file, &from_context) < 0)
	{
	    /* If the filesystem doesn't support extended attributes,
	       the original had no special security context and the
	       target cannot have one either.  */
	    if (errno == EOPNOTSUPP)
		return;

	    MSG_PUTS(_("\nCould not get security context for "));
	    msg_outtrans(from_file);
	    msg_putchar('\n');
	    return;
	}
	if (getfilecon((char *)to_file, &to_context) < 0)
	{
	    MSG_PUTS(_("\nCould not get security context for "));
	    msg_outtrans(to_file);
	    msg_putchar('\n');
	    freecon (from_context);
	    return ;
	}
	if (strcmp(from_context, to_context) != 0)
	{
	    if (setfilecon((char *)to_file, from_context) < 0)
	    {
		MSG_PUTS(_("\nCould not set security context for "));
		msg_outtrans(to_file);
		msg_putchar('\n');
	    }
	}
	freecon(to_context);
	freecon(from_context);
    }
}
#endif /* HAVE_SELINUX */

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
#ifndef OS2
    if (S_ISBLK(st.st_mode))	/* block device isn't writable */
	return NODE_OTHER;
#endif
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

    /*
     * Setup an alternative stack for signals.  Helps to catch signals when
     * running out of stack space.
     * Use of sigaltstack() is preferred, it's more portable.
     * Ignore any errors.
     */
#if defined(HAVE_SIGALTSTACK) || defined(HAVE_SIGSTACK)
    signal_stack = (char *)alloc(SIGSTKSZ);
    init_signal_stack();
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

#if defined(FEAT_X11) && defined(FEAT_CLIPBOARD)
    x11_export_final_selection();
#endif

#ifdef FEAT_GUI
    if (!gui.in_use)
#endif
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
    may_core_dump();
#ifdef FEAT_GUI
    if (gui.in_use)
	gui_exit(r);
#endif

#ifdef MACOS_CONVERT
    mac_conv_cleanup();
#endif

#ifdef __QNX__
    /* A core dump won't be created if the signal handler
     * doesn't return, so we can't call exit() */
    if (deadly_signal != 0)
	return;
#endif

#ifdef FEAT_NETBEANS_INTG
    netbeans_send_disconnect();
#endif

#ifdef EXITFREE
    free_all_mem();
#endif

    exit(r);
}

    static void
may_core_dump()
{
    if (deadly_signal != 0)
    {
	signal(deadly_signal, SIG_DFL);
	kill(getpid(), deadly_signal);	/* Die using the signal we caught */
    }
}

#ifndef VMS

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

#endif /* VMS  */


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

#ifndef VMS

/*
 * Try to get the current window size:
 * 1. with an ioctl(), most accurate method
 * 2. from the environment variables LINES and COLUMNS
 * 3. from the termcap
 * 4. keep using the old values
 * Return OK when size could be determined, FAIL otherwise.
 */
    int
mch_get_shellsize()
{
    long	rows = 0;
    long	columns = 0;
    char_u	*p;

    /*
     * For OS/2 use _scrsize().
     */
# ifdef __EMX__
    {
	int s[2];

	_scrsize(s);
	columns = s[0];
	rows = s[1];
    }
# endif

    /*
     * 1. try using an ioctl. It is the most accurate method.
     *
     * Try using TIOCGWINSZ first, some systems that have it also define
     * TIOCGSIZE but don't have a struct ttysize.
     */
# ifdef TIOCGWINSZ
    {
	struct winsize	ws;
	int fd = 1;

	/* When stdout is not a tty, use stdin for the ioctl(). */
	if (!isatty(fd) && isatty(read_cmd_fd))
	    fd = read_cmd_fd;
	if (ioctl(fd, TIOCGWINSZ, &ws) == 0)
	{
	    columns = ws.ws_col;
	    rows = ws.ws_row;
	}
    }
# else /* TIOCGWINSZ */
#  ifdef TIOCGSIZE
    {
	struct ttysize	ts;
	int fd = 1;

	/* When stdout is not a tty, use stdin for the ioctl(). */
	if (!isatty(fd) && isatty(read_cmd_fd))
	    fd = read_cmd_fd;
	if (ioctl(fd, TIOCGSIZE, &ts) == 0)
	{
	    columns = ts.ts_cols;
	    rows = ts.ts_lines;
	}
    }
#  endif /* TIOCGSIZE */
# endif /* TIOCGWINSZ */

    /*
     * 2. get size from environment
     *    When being POSIX compliant ('|' flag in 'cpoptions') this overrules
     *    the ioctl() values!
     */
    if (columns == 0 || rows == 0 || vim_strchr(p_cpo, CPO_TSIZE) != NULL)
    {
	if ((p = (char_u *)getenv("LINES")))
	    rows = atoi((char *)p);
	if ((p = (char_u *)getenv("COLUMNS")))
	    columns = atoi((char *)p);
    }

#ifdef HAVE_TGETENT
    /*
     * 3. try reading "co" and "li" entries from termcap
     */
    if (columns == 0 || rows == 0)
	getlinecol(&columns, &rows);
#endif

    /*
     * 4. If everything fails, use the old values
     */
    if (columns <= 0 || rows <= 0)
	return FAIL;

    Rows = rows;
    Columns = columns;
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

#endif /* VMS */

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
    return FAIL;
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

#ifndef VMS

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
#ifdef __EMX__
    /*
     * This is the OS/2 implementation.
     */
# define EXPL_ALLOC_INC	16
    char_u	**expl_files;
    size_t	files_alloced, files_free;
    char_u	*buf;
    int		has_wildcard;

    *num_file = 0;	/* default: no files found */
    files_alloced = EXPL_ALLOC_INC; /* how much space is allocated */
    files_free = EXPL_ALLOC_INC;    /* how much space is not used  */
    *file = (char_u **)alloc(sizeof(char_u **) * files_alloced);
    if (*file == NULL)
	return FAIL;

    for (; num_pat > 0; num_pat--, pat++)
    {
	expl_files = NULL;
	if (vim_strchr(*pat, '$') || vim_strchr(*pat, '~'))
	    /* expand environment var or home dir */
	    buf = expand_env_save(*pat);
	else
	    buf = vim_strsave(*pat);
	expl_files = NULL;
	has_wildcard = mch_has_exp_wildcard(buf);  /* (still) wildcards? */
	if (has_wildcard)   /* yes, so expand them */
	    expl_files = (char_u **)_fnexplode(buf);

	/*
	 * return value of buf if no wildcards left,
	 * OR if no match AND EW_NOTFOUND is set.
	 */
	if ((!has_wildcard && ((flags & EW_NOTFOUND) || mch_getperm(buf) >= 0))
		|| (expl_files == NULL && (flags & EW_NOTFOUND)))
	{   /* simply save the current contents of *buf */
	    expl_files = (char_u **)alloc(sizeof(char_u **) * 2);
	    if (expl_files != NULL)
	    {
		expl_files[0] = vim_strsave(buf);
		expl_files[1] = NULL;
	    }
	}
	vim_free(buf);

	/*
	 * Count number of names resulting from expansion,
	 * At the same time add a backslash to the end of names that happen to
	 * be directories, and replace slashes with backslashes.
	 */
	if (expl_files)
	{
	    for (i = 0; (p = expl_files[i]) != NULL; i++)
	    {
		dir = mch_isdir(p);
		/* If we don't want dirs and this is one, skip it */
		if ((dir && !(flags & EW_DIR)) || (!dir && !(flags & EW_FILE)))
		    continue;

		/* Skip files that are not executable if we check for that. */
		if (!dir && (flags & EW_EXEC) && !mch_can_exe(p))
		    continue;

		if (--files_free == 0)
		{
		    /* need more room in table of pointers */
		    files_alloced += EXPL_ALLOC_INC;
		    *file = (char_u **)vim_realloc(*file,
					   sizeof(char_u **) * files_alloced);
		    if (*file == NULL)
		    {
			EMSG(_(e_outofmem));
			*num_file = 0;
			return FAIL;
		    }
		    files_free = EXPL_ALLOC_INC;
		}
		slash_adjust(p);
		if (dir)
		{
		    /* For a directory we add a '/', unless it's already
		     * there. */
		    len = STRLEN(p);
		    if (((*file)[*num_file] = alloc(len + 2)) != NULL)
		    {
			STRCPY((*file)[*num_file], p);
			if (!after_pathsep((*file)[*num_file],
						    (*file)[*num_file] + len))
			{
			    (*file)[*num_file][len] = psepc;
			    (*file)[*num_file][len + 1] = NUL;
			}
		    }
		}
		else
		{
		    (*file)[*num_file] = vim_strsave(p);
		}

		/*
		 * Error message already given by either alloc or vim_strsave.
		 * Should return FAIL, but returning OK works also.
		 */
		if ((*file)[*num_file] == NULL)
		    break;
		(*num_file)++;
	    }
	    _fnexplodefree((char **)expl_files);
	}
    }
    return OK;

#else /* __EMX__ */
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

#endif /* __EMX__ */
}

#endif /* VMS */

#ifndef __EMX__
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
#endif

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
#ifndef OS2
	if (*p == '\\' && p[1] != NUL)
	    ++p;
	else
#endif
	    if (vim_strchr((char_u *)
#ifdef VMS
				    "*?%"
#else
# ifdef OS2
				    "*?"
# else
				    "*?[{'"
# endif
#endif
						, *p) != NULL)
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
#ifndef OS2
	if (*p == '\\' && p[1] != NUL)
	    ++p;
	else
#endif
	    if (vim_strchr((char_u *)
#ifdef VMS
				    "*?%$"
#else
# ifdef OS2
#  ifdef VIM_BACKTICK
				    "*?$`"
#  else
				    "*?$"
#  endif
# else
				    "*?[{`'$"
# endif
#endif
						, *p) != NULL
		|| (*p == '~' && p[1] != NUL))
	    return TRUE;
    }
    return FALSE;
}

#ifndef __EMX__
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
#endif	/* ifndef __EMX__ */

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

#ifdef EBCDIC
/* Translate character to its CTRL- value */
char CtrlTable[] =
{
/* 00 - 5E */
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
/* ^ */ 0x1E,
/* - */ 0x1F,
/* 61 - 6C */
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
/* _ */ 0x1F,
/* 6E - 80 */
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
/* a */ 0x01,
/* b */ 0x02,
/* c */ 0x03,
/* d */ 0x37,
/* e */ 0x2D,
/* f */ 0x2E,
/* g */ 0x2F,
/* h */ 0x16,
/* i */ 0x05,
/* 8A - 90 */
	0, 0, 0, 0, 0, 0, 0,
/* j */ 0x15,
/* k */ 0x0B,
/* l */ 0x0C,
/* m */ 0x0D,
/* n */ 0x0E,
/* o */ 0x0F,
/* p */ 0x10,
/* q */ 0x11,
/* r */ 0x12,
/* 9A - A1 */
	0, 0, 0, 0, 0, 0, 0, 0,
/* s */ 0x13,
/* t */ 0x3C,
/* u */ 0x3D,
/* v */ 0x32,
/* w */ 0x26,
/* x */ 0x18,
/* y */ 0x19,
/* z */ 0x3F,
/* AA - AC */
	0, 0, 0,
/* [ */ 0x27,
/* AE - BC */
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
/* ] */ 0x1D,
/* BE - C0 */ 0, 0, 0,
/* A */ 0x01,
/* B */ 0x02,
/* C */ 0x03,
/* D */ 0x37,
/* E */ 0x2D,
/* F */ 0x2E,
/* G */ 0x2F,
/* H */ 0x16,
/* I */ 0x05,
/* CA - D0 */ 0, 0, 0, 0, 0, 0, 0,
/* J */ 0x15,
/* K */ 0x0B,
/* L */ 0x0C,
/* M */ 0x0D,
/* N */ 0x0E,
/* O */ 0x0F,
/* P */ 0x10,
/* Q */ 0x11,
/* R */ 0x12,
/* DA - DF */ 0, 0, 0, 0, 0, 0,
/* \ */ 0x1C,
/* E1 */ 0,
/* S */ 0x13,
/* T */ 0x3C,
/* U */ 0x3D,
/* V */ 0x32,
/* W */ 0x26,
/* X */ 0x18,
/* Y */ 0x19,
/* Z */ 0x3F,
/* EA - FF*/ 0, 0, 0, 0, 0, 0,
	0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
};

char MetaCharTable[]=
{/*   0   1   2   3   4   5   6   7   8   9   A   B   C   D   E   F */
      0,  0,  0,  0,'\\', 0,'F',  0,'W','M','N',  0,  0,  0,  0,  0,
      0,  0,  0,  0,']',  0,  0,'G',  0,  0,'R','O',  0,  0,  0,  0,
    '@','A','B','C','D','E',  0,  0,'H','I','J','K','L',  0,  0,  0,
    'P','Q',  0,'S','T','U','V',  0,'X','Y','Z','[',  0,  0,'^',  0
};


/* TODO: Use characters NOT numbers!!! */
char CtrlCharTable[]=
{/*   0   1   2   3   4   5   6   7   8   9   A   B   C   D   E   F */
    124,193,194,195,  0,201,  0,  0,  0,  0,  0,210,211,212,213,214,
    215,216,217,226,  0,209,200,  0,231,232,  0,  0,224,189, 95,109,
      0,  0,  0,  0,  0,  0,230,173,  0,  0,  0,  0,  0,197,198,199,
      0,  0,229,  0,  0,  0,  0,196,  0,  0,  0,  0,227,228,  0,233,
};


#endif
