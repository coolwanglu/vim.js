/* vi:set ts=8 sts=4 sw=4:
 *
 * VIM - Vi IMproved		by Bram Moolenaar
 *                              Browser port by Lu Wang
 *
 * Do ":help uganda"  in Vim to read copying and usage conditions.
 * Do ":help credits" in Vim to see a list of people who contributed.
 * See README.txt for an overview of the Vim source code.
 */

/*
 * gui_browser.c 
 * gui functions for vim.js
 *
 * Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>
 */

#ifdef FEAT_GUI_BROWSER
#include "vim.h"

     void
gui_mch_mousehide(int hide)
{
}

/*
 * ------------------------------------------------------------
 * GUI_MCH functionality
 * ------------------------------------------------------------
 */

/*
 * Parse the GUI related command-line arguments.  Any arguments used are
 * deleted from argv, and *argc is decremented accordingly.  This is called
 * when vim is started, whether or not the GUI has been started.
 */
    void
gui_mch_prepare(int *argc, char **argv)
{
    // nothing to do
}



#ifndef ALWAYS_USE_GUI
/*
 * Check if the GUI can be started.  Called before gvimrc is sourced.
 * Return OK or FAIL.
 *
 * Not needed by vim.js
 */
    int
gui_mch_init_check(void)
{
    return OK;
}
#endif

/*
 * Initialise the GUI.  Create all the windows, set up all the call-backs
 * etc.
 */
    int
gui_mch_init(void)
{
    vimjs_init();
    gui.border_offset = 0;
    gui.border_width = 0;
    gui.scrollbar_width = 0;
    gui.scrollbar_height = 0;

    gui.back_pixel = gui_get_color("black");
    gui.norm_pixel = gui_get_color("white");

    set_normal_colors();
    gui_check_colors();

    gui.def_back_pixel = gui.back_pixel;
    gui.def_norm_pixel = gui.norm_pixel;

    gui.in_focus = TRUE; 

    Rows = vimjs_get_window_height() / vimjs_get_char_height();
    Columns = vimjs_get_window_width() / vimjs_get_char_width();

    return OK;
}


/*
 * Called when the foreground or background color has been changed.
 */
    void
gui_mch_new_colors(void)
{
    // Nothing to do
}

/*
 * Open the GUI window which was created by a call to gui_mch_init().
 */
    int
gui_mch_open(void)
{
    return OK;
}

    void
gui_mch_exit(int rc)
{
    // Nothing to do
}

/*
 * Get the position of the top left corner of the window.
 */
    int
gui_mch_get_winpos(int *x, int *y)
{
    *x = *y = 0;
    return OK;
}

/*
 * Set the position of the top left corner of the window to the given
 * coordinates.
 */
    void
gui_mch_set_winpos(int x, int y)
{
    // Nothing to do
    // we never change winpos
}

    void
gui_mch_set_shellsize(
    int		width,
    int		height,
    int		min_width,
    int		min_height,
    int		base_width,
    int		base_height,
    int		direction)
{
    vimjs_resize(width, height);
}

/*
 * Get the screen dimensions.
 *
 * Lu Wang: fake large enough values
 */
    void
gui_mch_get_screen_dimensions(int *screen_w, int *screen_h)
{
    *screen_w = vimjs_get_window_width() * 2;
    *screen_h = vimjs_get_window_height() * 2;
}

/*
 * Initialise vim to use the font with the given name.	Return FAIL if the font
 * could not be loaded, OK otherwise.
 */
    int
gui_mch_init_font(char_u *font_name, int fontset)
{
    vimjs_init_font((char*)font_name);

    gui.char_width = vimjs_get_char_width();
    gui.char_height = vimjs_get_char_height();
    gui.char_ascent = gui.char_height;

    int w,h;
    w = vimjs_get_window_width();
    h = vimjs_get_window_height();
    gui_resize_shell(w, h);

    return OK;
}

/*
 * Adjust gui.char_height (after 'linespace' was changed).
 */
    int
gui_mch_adjust_charheight(void)
{
    //TODO
    return FAIL;
}

/*
 * Get a font structure for highlighting.
 */
    GuiFont
gui_mch_get_font(char_u *name, int giveErrorIfMissing)
{
    // TODO
    return NOFONT;
}

#if defined(FEAT_EVAL) || defined(PROTO)
/*
 * Return the name of font "font" in allocated memory.
 * Don't know how to get the actual name, thus use the provided name.
 */
    char_u *
gui_mch_get_fontname(GuiFont font, char_u *name)
{
    if (font != NOFONT)
    {
        return vim_strsave((char_u*)font);
    }
    return NULL;
}
#endif

/*
 * Set the current text font.
 */
    void
gui_mch_set_font(GuiFont font)
{
    //TODO
}

/*
 * If a font is not going to be used, free its structure.
 */
    void
gui_mch_free_font(font)
    GuiFont	font;
{
    free(font);
}

/*
 * Return the Pixel value (color) for the given color name.  
 * Return INVALCOLOR when failed.
 */
    guicolor_T
gui_mch_get_color(char_u *name)
{
    if(vimjs_is_valid_color((char*)name))        
        return (guicolor_T)vimjs_get_rgb((char*)name);
    return INVALCOLOR;
}

/*
 * Set the current text foreground color.
 */
    void
gui_mch_set_fg_color(guicolor_T color)
{
    vimjs_set_fg_color(color);
}

/*
 * Set the current text background color.
 */
    void
gui_mch_set_bg_color(guicolor_T color)
{
    vimjs_set_bg_color(color);
}

/*
 * Set the current text special color.
 */
    void
gui_mch_set_sp_color(guicolor_T color)
{
    vimjs_set_sp_color(color);
}

    void
gui_mch_draw_string(int row, int col, char_u *s, int len, int flags)
{
    vimjs_draw_string(row, col, s, len, flags);
}

/*
 * Return OK if the key with the termcap name "name" is supported.
 */
    int
gui_mch_haskey(char_u *name)
{
    return vimjs_haskey((char*)name) ? OK : FAIL;
}

    void
gui_mch_beep(void)
{
    vimjs_beep();
}

    void
gui_mch_flash(int msec)
{
    vimjs_flash();
}

/*
 * Invert a rectangle from row r, column c, for nr rows and nc columns.
 */
    void
gui_mch_invert_rectangle(int r, int c, int nr, int nc)
{
    vimjs_invert_rectangle(r, c, nr, nc);
}

/*
 * Iconify the GUI window.
 */
    void
gui_mch_iconify(void)
{
}

#if defined(FEAT_EVAL) || defined(PROTO)
/*
 * Bring the Vim window to the foreground.
 */
    void
gui_mch_set_foreground(void)
{
    // Nothing to do
}
#endif

/*
 * Draw a cursor without focus.
 */
    void
gui_mch_draw_hollow_cursor(guicolor_T color)
{
    gui_mch_set_fg_color(color);
    vimjs_draw_hollow_cursor(gui.row, gui.col);
}

/*
 * Draw part of a cursor, only w pixels wide, and h pixels high.
 */
    void
gui_mch_draw_part_cursor(int w, int h, guicolor_T color)
{
    gui_mch_set_fg_color(color);
    vimjs_draw_part_cursor(gui.row, gui.col, w, h);
}



/*
 * Catch up with any queued X events.  This may put keyboard input into the
 * input buffer, call resize call-backs, trigger timers etc.  If there is
 * nothing in the X event queue (& no timers pending), then we return
 * immediately.
 */
    void
gui_mch_update(void)
{
    vimjs_update();
}

/*
 * GUI input routine called by gui_wait_for_chars().  Waits for a character
 * from the keyboard.
 *  wtime == -1	    Wait forever.
 *  wtime == 0	    This should never happen.
 *  wtime > 0	    Wait wtime milliseconds for a character.
 * Returns OK if a character was found to be available within the given time,
 * or FAIL otherwise.
 */
    int
gui_mch_wait_for_chars(int wtime)
{
    return vimjs_wait_for_chars(wtime);
}


    void
gui_browser_handle_key(int code, int modifiers, char_u special1, char_u special2)
{
    char_u buf[64];
    int buf_len = 0;
    int is_special = (special1 != 0);

    if(is_special) 
    {
        code = TO_SPECIAL(special1, special2);
        code = simplify_key(code, &modifiers);
    }
    else 
    {
        if(code == 'c' && (modifiers & MOD_MASK_CTRL))
            got_int = TRUE;
        if(!IS_SPECIAL(code))
        {
            code = simplify_key(code, &modifiers);
            code = extract_modifiers(code, &modifiers);
            if(code == CSI)
                code = K_CSI;
            if(IS_SPECIAL(code))
                is_special = TRUE;
        }
    }

    if(modifiers) 
    {
        buf[buf_len++] = CSI;
        buf[buf_len++] = KS_MODIFIER;
        buf[buf_len++] = modifiers;
    }

    if(is_special && IS_SPECIAL(code))
    {
        buf[buf_len++] = CSI;
        buf[buf_len++] = K_SECOND(code);
        buf[buf_len++] = K_THIRD(code);
    }
    else
    {
        // TODO: support Unicode
        buf[buf_len++] = code;
    }

    if(buf_len)
        add_to_input_buf(buf, buf_len);
}


/*
 * Output routines.
 */

/* Flush any output to the screen */
    void
gui_mch_flush(void)
{
    // Nothing to do
}

/*
 * Clear a rectangular region of the screen from text pos (row1, col1) to
 * (row2, col2) inclusive.
 */
    void
gui_mch_clear_block(int row1, int col1, int row2, int col2)
{
    gui_mch_set_bg_color(gui.back_pixel);
    vimjs_clear_block(row1, col1, row2, col2);
}

/*
 * Clear the whole text window.
 */
    void
gui_mch_clear_all(void)
{
    gui_mch_set_bg_color(gui.back_pixel);
    vimjs_clear_all();
}

/*
 * Delete the given number of lines from the given row, scrolling up any
 * text further down within the scroll region.
 */
    void
gui_mch_delete_lines(int row, int num_lines)
{
    gui_mch_set_bg_color(gui.back_pixel);
    vimjs_delete_lines(num_lines, row, gui.scroll_region_bot, gui.scroll_region_left, gui.scroll_region_right);
}

/*
 * Insert the given number of lines before the given row, scrolling down any
 * following text within the scroll region.
 */
    void
gui_mch_insert_lines(int row, int num_lines)
{
    gui_mch_set_bg_color(gui.back_pixel);
    vimjs_insert_lines(num_lines, row, gui.scroll_region_bot, gui.scroll_region_left, gui.scroll_region_right);
}


    void
gui_mch_set_text_area_pos(int x, int y, int w, int h)
{
    // Nothing to do
}


    void
clip_mch_request_selection(VimClipboard *cbd)
{
}


    void
clip_mch_lose_selection(VimClipboard *cbd)
{
}

    int
clip_mch_own_selection(VimClipboard *cbd)
{
    return OK;
}

/*
 * Send the current selection to the clipboard.
 */
    void
clip_mch_set_selection(VimClipboard *cbd)
{
}


/*
 * Menu stuff.
 */

    void
gui_mch_enable_menu(int flag)
{
}

    void
gui_mch_set_menu_pos(int x, int y, int w, int h)
{
}

/*
 * Add a sub menu to the menu bar.
 */
    void
gui_mch_add_menu(vimmenu_T *menu, int idx)
{
}


/*
 * Add a menu item to a menu
 */
    void
gui_mch_add_menu_item(vimmenu_T *menu, int idx)
{
}


    void
gui_mch_toggle_tearoffs(int enable)
{
}

/*
 * Destroy the machine specific menu widget.
 */
    void
gui_mch_destroy_menu(vimmenu_T *menu)
{
}


/*
 * Make a menu either grey or not grey.
 */
    void
gui_mch_menu_grey(vimmenu_T *menu, int grey)
{
}


/*
 * Make menu item hidden or not hidden
 */
    void
gui_mch_menu_hidden(vimmenu_T *menu, int hidden)
{
}


/*
 * This is called after setting all the menus to grey/hidden or not.
 */
    void
gui_mch_draw_menubar(void)
{
}


/*
 * Scrollbar stuff.
 */

    void
gui_mch_enable_scrollbar(
	scrollbar_T	*sb,
	int		flag)
{
}

    void
gui_mch_set_scrollbar_thumb(
	scrollbar_T *sb,
	long val,
	long size,
	long max)
{
}

    void
gui_mch_set_scrollbar_pos(
	scrollbar_T *sb,
	int x,
	int y,
	int w,
	int h)
{
}

    void
gui_mch_create_scrollbar(
	scrollbar_T *sb,
	int orient)	/* SBAR_VERT or SBAR_HORIZ */
{
}


    void
gui_mch_destroy_scrollbar(scrollbar_T *sb)
{
}


/*
 * Cursor blink functions.
 *
 * This is a simple state machine:
 * BLINK_NONE	not blinking at all
 * BLINK_OFF	blinking, cursor is not shown
 * BLINK_ON blinking, cursor is shown
 */
    void
gui_mch_set_blinking(long wait, long on, long off)
{
}

/*
 * Stop the cursor blinking.  Show the cursor if it wasn't shown.
 */
    void
gui_mch_stop_blink(void)
{
}

/*
 * Start the cursor blinking.  If it was already blinking, this restarts the
 * waiting time and shows the cursor.
 */
    void
gui_mch_start_blink(void)
{
}

/*
 * Return the RGB value of a pixel as long.
 */
    long_u
gui_mch_get_rgb(guicolor_T pixel)
{
    return vimjs_get_rgb(pixel);
}



#ifdef FEAT_BROWSE
/*
 * Pop open a file browser and return the file selected, in allocated memory,
 * or NULL if Cancel is hit.
 *  saving  - TRUE if the file will be saved to, FALSE if it will be opened.
 *  title   - Title message for the file browser dialog.
 *  dflt    - Default name of file.
 *  ext     - Default extension to be added to files without extensions.
 *  initdir - directory in which to open the browser (NULL = current dir)
 *  filter  - Filter for matched files to choose from.
 *  Has a format like this:
 *  "C Files (*.c)\0*.c\0"
 *  "All Files\0*.*\0\0"
 *  If these two strings were concatenated, then a choice of two file
 *  filters will be selectable to the user.  Then only matching files will
 *  be shown in the browser.  If NULL, the default allows all files.
 *
 *  *NOTE* - the filter string must be terminated with TWO nulls.
 */
    char_u *
gui_mch_browse(
    int saving,
    char_u *title,
    char_u *dflt,
    char_u *ext,
    char_u *initdir,
    char_u *filter)
{
    char buf[4096];
    vimjs_browse(buf, 4096, saving, (char*)dflt, (char*)initdir);
    if(*buf == 0) {
        return NULL;
    }
    return vim_strsave(buf);
}
#endif /* FEAT_BROWSE */

#ifdef FEAT_GUI_DIALOG
/*
 * Stuff for dialogues
 */

/*
 * Create a dialogue dynamically from the parameter strings.
 * type       = type of dialogue (question, alert, etc.)
 * title      = dialogue title. may be NULL for default title.
 * message    = text to display. Dialogue sizes to accommodate it.
 * buttons    = '\n' separated list of button captions, default first.
 * dfltbutton = number of default button.
 *
 * This routine returns 1 if the first button is pressed,
 *	    2 for the second, etc.
 *
 *	    0 indicates Esc was pressed.
 *	    -1 for unexpected error
 *
 * If stubbing out this fn, return 1.
 */

    int
gui_mch_dialog(
    int		type,
    char_u	*title,
    char_u	*message,
    char_u	*buttons,
    int		dfltbutton,
    char_u	*textfield,
    int		ex_cmd)
{
    return -1;
}
#endif /* FEAT_DIALOG_GUI */

/*
 * Get current mouse coordinates in text window.
 */
    void
gui_mch_getmouse(int *x, int *y)
{
    *x = *y = 0;
}

    void
gui_mch_setmouse(int x, int y)
{
}

    void
gui_mch_show_popupmenu(vimmenu_T *menu)
{
}


#ifdef FEAT_TITLE
/*
 * Set the window title and icon.
 */
    void
gui_mch_settitle(char_u *title, char_u *icon)
{
}
#endif

#if defined(FEAT_GUI_TABLINE)
/*
 * Show or hide the tabline.
 */
    void
gui_mch_show_tabline(int showit)
{
}

/*
 * Return TRUE when tabline is displayed.
 */
    int
gui_mch_showing_tabline(void)
{
    return FALSE;
}

/*
 * Update the labels of the tabline.
 */
    void
gui_mch_update_tabline(void)
{
}


/*
 * Set the current tab to "nr".  First tab is 1.
 */
    void
gui_mch_set_curtab(nr)
    int		nr;
{
}

#endif // FEAT_GUI_TABLINE
#endif //FEAT_GUI_BROWSER
