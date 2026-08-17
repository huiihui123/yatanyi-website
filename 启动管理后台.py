"""
雅檀怡家私城 — 管理后台启动器 v4.2
====================================
【v4.1 → v4.2】
  新增：端口被占用但 /api/health 无响应时，自动杀掉卡死进程并重启
        （解决「频繁刷新后连接超时、刷新多少次都连不上」）
"""
import os
import sys
import time
import socket
import subprocess
import webbrowser

# ========== 项目路径（★ 多级查找，脚本放哪都能用） ==========
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))          # 脚本所在目录

# ① 优先：脚本同目录下有 backend 就用它
if os.path.isdir(os.path.join(_SCRIPT_DIR, 'backend')):
    PROJECT_DIR = _SCRIPT_DIR
# ② 兜底：用户确认的网站固定路径（F盘项目目录）
elif os.path.isdir(r'F:\zhuomian\雅檀怡家私网站开发(3)\backend'):
    PROJECT_DIR = r'F:\zhuomian\雅檀怡家私网站开发(3)'
# ③ 最后：当前工作目录
else:
    PROJECT_DIR = os.getcwd()

BACKEND_DIR = os.path.join(PROJECT_DIR, 'backend')   # 后端目录
PORT = 5000                                          # Flask端口


def find_python():
    """
    ★ 找到「真正能运行后端」的Python解释器
    判断标准：能 import flask 和 openpyxl（后端依赖）
    """
    # 候选列表：先检查路径是否存在，存在才测（加快速度）
    candidates = [
        r'D:\dev\env_configs\python\Python 3.12.4\python.exe',  # 已确认可用
        r'D:\dev\env_configs\python\python 3.8.2\python.exe',
        r'C:\Python311\python.exe',
        r'C:\Python310\python.exe',
        r'C:\Python39\python.exe',
        r'C:\Python38\python.exe',
        r'C:\Program Files\Python311\python.exe',
        r'C:\Program Files\Python310\python.exe',
        r'C:\Program Files\Python39\python.exe',
        r'C:\Users\Administrator\AppData\Local\Programs\Python\Python311\python.exe',
        r'C:\Users\Administrator\AppData\Local\Programs\Python\Python310\python.exe',
        'python',   # PATH中的python（逐个测试依赖）
        'py',       # Windows Python Launcher
    ]

    for cmd in candidates:
        # 如果是路径且不存在，直接跳过（加快探测）
        if os.path.sep in cmd and not os.path.exists(cmd):
            continue
        try:
            # ★ 直接测依赖，能跑后端才算数
            r = subprocess.run(
                [cmd, '-c', 'import flask, openpyxl'],
                capture_output=True, timeout=5
            )
            if r.returncode == 0:
                return cmd  # 找到能用的Python！
        except Exception:
            continue
    return None  # 全部失败


def check_port(port=PORT):
    """检查端口是否被占用（后端是否已在运行）"""
    s = socket.socket()
    s.settimeout(0.3)
    try:
        s.connect(('127.0.0.1', port))
        s.close()
        return True   # 端口有服务在监听
    except Exception:
        return False  # 端口空闲


def health_ok(port=PORT, timeout=2.0):
    """端口开着但健康检查失败 = 半死进程，需要强制回收"""
    try:
        import urllib.request
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health', timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


def kill_port(port=PORT):
    """强制释放被卡死占用的端口（Windows）"""
    if sys.platform != 'win32':
        return False
    try:
        out = subprocess.check_output(
            f'netstat -ano | findstr :{port}',
            shell=True, text=True, errors='ignore'
        )
        pids = set()
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 5 and f':{port}' in parts[1] and parts[3].upper() == 'LISTENING':
                pids.add(parts[-1])
        killed = False
        for pid in pids:
            if pid.isdigit() and int(pid) > 0:
                subprocess.run(['taskkill', '/F', '/PID', pid],
                               capture_output=True, check=False)
                killed = True
                print(f"   已结束卡死进程 PID={pid}")
        return killed
    except Exception as e:
        print(f"   释放端口失败: {e}")
        return False


def main():
    """主流程：找Python → 启动后端 → 等就绪 → 打开管理后台"""
    print("=" * 52)
    print("  雅檀怡家私城 · 管理后台启动器 v4.2")
    print(f"  项目目录: {PROJECT_DIR}")
    print("=" * 52)

    # ── 第0步：检查 backend 目录是否存在 ──
    if not os.path.isdir(BACKEND_DIR):
        print(f"\n❌ 找不到后端目录：{BACKEND_DIR}")
        print("   请确认网站项目完整（含 backend 文件夹）")
        input("\n按回车退出...")
        sys.exit(1)

    # ── 第1步：后端已在运行？直接打开管理面板 ──
    if check_port(PORT):
        if health_ok(PORT):
            print(f"\n✅ 后端已在运行（端口 {PORT}），直接打开管理面板...")
            webbrowser.open(f'http://localhost:{PORT}/admin')
            print("\n按回车退出（后端保持运行）...")
            input()
            return
        # 端口被占但健康检查失败 = 卡死/半死进程，强制回收后重启
        print(f"\n⚠ 端口 {PORT} 被占用，但服务无响应（疑似卡死）")
        print("   正在自动释放端口并重启...")
        kill_port(PORT)
        time.sleep(1.2)
        if check_port(PORT):
            print("   ❌ 端口仍被占用，请手动关闭占用 5000 的进程后重试")
            input("\n按回车退出...")
            sys.exit(1)
        print("   ✅ 端口已释放，继续启动...")

    # ── 第2步：找到能用的Python ──
    print("\n🔍 正在查找可用的Python环境...")
    python = find_python()
    if python is None:
        print("\n❌ 未找到可用Python（需要已安装 Flask 和 openpyxl）")
        print("   解决办法：pip install flask flask-cors openpyxl")
        input("\n按回车退出...")
        sys.exit(1)
    print(f"   ✅ 使用: {python}")

    # ── 第3步：启动后端进程（★ 加try保护，失败不闪退） ──
    print(f"\n🟢 启动后端服务...")
    try:
        proc = subprocess.Popen(
            [python, 'app.py'],
            cwd=BACKEND_DIR,
            stdout=subprocess.DEVNULL,   # 正常日志不显示
            stderr=subprocess.PIPE,      # 错误信息保留，失败时打印
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        )
    except Exception as e:
        print(f"\n❌ 无法启动后端进程：{e}")
        print(f"   后端目录: {BACKEND_DIR}")
        print(f"   Python:   {python}")
        input("\n按回车退出...")
        sys.exit(1)

    # ── 第4步：等待后端就绪（最多10秒） ──
    print("⏳ 等待后端就绪", end='', flush=True)
    for _ in range(34):  # 34 × 0.3s ≈ 10秒
        if check_port(PORT):
            print(" ✅")
            break
        # 进程提前退出 = 启动失败，读取stderr打印真实原因
        if proc.poll() is not None:
            print("\n❌ 后端启动失败！")
            try:
                err = proc.stderr.read().decode('utf-8', errors='ignore')[:800]
                if err:
                    print(f"\n错误信息：\n{err}")
            except Exception:
                pass
            print("\n   可能原因：")
            print("   ① Python缺少依赖 → pip install flask flask-cors openpyxl")
            print("   ② 端口5000被其他程序占用")
            print("   ③ app.py 代码报错")
            input("\n按回车退出...")
            sys.exit(1)
        time.sleep(0.3)
        print('.', end='', flush=True)
    else:
        # 10秒还没就绪
        print("\n❌ 启动超时！")
        input("\n按回车退出...")
        sys.exit(1)

    # ── 第5步：打开管理后台浏览器 ──
    print(f"\n📊 管理后台: http://localhost:{PORT}/admin")
    print(f"🏠 前台页面: http://localhost:{PORT}/index.html")
    print("\n⚠ 关闭本窗口 = 停止后端服务")
    print("=" * 52)
    webbrowser.open(f'http://localhost:{PORT}/admin')

    # ── 第6步：保持窗口存活 ──
    try:
        while proc.poll() is None:
            time.sleep(1)
    except KeyboardInterrupt:
        pass

    # ── 第7步：收尾清理 ──
    print("\n🛑 正在关闭后端...")
    try:
        # 优先走优雅关闭接口（app.py 的 /api/shutdown）
        import urllib.request
        req = urllib.request.Request(f'http://localhost:{PORT}/api/shutdown', method='POST', data=b'')
        urllib.request.urlopen(req, timeout=2)
        time.sleep(1)
    except Exception:
        pass
    # 兜底：强制结束进程
    try:
        proc.terminate()
    except Exception:
        pass
    print("✅ 已关闭。再见！")


if __name__ == '__main__':
    main()
