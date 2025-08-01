import os
import time
import datetime
import curses

# 指定监控的文件夹路径
monitor_folder = '/diskb/video'
# 给定的阈值（秒）
threshold = 6

def get_latest_webm_info(folder_path):
    webm_files = [f for f in os.listdir(folder_path) if f.endswith('.webm')]
    if not webm_files:
        return None, None
    
    latest_webm = max(webm_files, key=lambda f: os.path.getmtime(os.path.join(folder_path, f)))
    latest_webm_path = os.path.join(folder_path, latest_webm)
    modification_time = os.path.getmtime(latest_webm_path)
    file_size = os.path.getsize(latest_webm_path)
    
    return modification_time, file_size

def format_file_size(size):
    if size < 1024:
        return f"{size} B"
    elif size < 1024 * 1024:
        return f"{size / 1024:.2f} KB"
    elif size < 1024 * 1024 * 1024:
        return f"{size / (1024 * 1024):.2f} MB"
    else:
        return f"{size / (1024 * 1024 * 1024):.2f} GB"

def monitor_folders(stdscr):
    curses.curs_set(0)  # 隐藏光标
    stdscr.nodelay(1)  # 使getch()不阻塞
    stdscr.timeout(500)  # 设置刷新间隔为100毫秒

    start_row = 0
    data = []

    while True:
        stdscr.clear()
        max_y, max_x = stdscr.getmaxyx()  # 获取窗口的最大行数和列数
        stdscr.addstr(0, 0, f"{'学号':<10}{'最新修改时间':<20}{'时间差(s)':<10}{'是否小于阈值':<15}{'文件大小':<15}")
        
        data.clear()
        for folder_name in sorted(os.listdir(monitor_folder)):
            if folder_name.startswith('u') and folder_name[1:].isdigit():
                folder_path = os.path.join(monitor_folder, folder_name)
                if os.path.isdir(folder_path):
                    student_id = folder_name[1:]
                    modification_time, file_size = get_latest_webm_info(folder_path)
                    if modification_time is not None:
                        current_time = time.time()
                        time_diff = current_time - modification_time
                        is_below_threshold = time_diff < threshold
                        modification_time_str = datetime.datetime.fromtimestamp(modification_time).strftime('%Y-%m-%d %H:%M:%S')
                        data.append((student_id, modification_time_str, time_diff, is_below_threshold, file_size))
        
        # 将小于阈值为False的条目排在最前面，并按学号从小到大排序
        data.sort(key=lambda x: (x[3], int(x[0])))

        for i, row_data in enumerate(data[start_row:start_row + max_y - 2]):
            student_id, modification_time_str, time_diff, is_below_threshold, file_size = row_data
            stdscr.addstr(i + 1, 0, f"{student_id:<10}{modification_time_str:<20}{time_diff:<10.2f}{str(is_below_threshold):<15}{format_file_size(file_size):<15}")
        
        key = stdscr.getch()
        if key == curses.KEY_UP and start_row > 0:
            start_row -= 1
        elif key == curses.KEY_DOWN and start_row + max_y - 2 < len(data):
            start_row += 1
        elif key == curses.KEY_NPAGE and start_row + max_y - 2 < len(data):
            start_row += max_y - 2
        elif key == curses.KEY_PPAGE and start_row > 0:
            start_row -= max_y - 2
            if start_row < 0:
                start_row = 0
        
        stdscr.refresh()

if __name__ == "__main__":
    curses.wrapper(monitor_folders)