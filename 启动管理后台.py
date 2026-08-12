"""
雅檀怡家私城 — 管理后台启动器 v3
================================
双击运行 → 自动启动后端 → 打开浏览器管理面板
无需tkinter exe，稳定可靠，零BUG。
关闭此窗口即停止后端服务。
"""
import os, sys, subprocess, time, socket, webbrowser

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(PROJECT_DIR, 'backend')

def find_python():
    """找到可用的Python"""
    for cmd in ['python', 'python3', 'py']:
        try:
            subprocess.run([cmd, '--version'], capture_output=True, timeout=3)
            return cmd
        except: pass
    print("❌ 未找到Python，请先安装 Python 3.x")
    print("   下载：https://www.python.org/downloads/")
    input("按回车退出...")
    sys.exit(1)

def check_port(port=5000):
    s = socket.socket(); s.settimeout(0.3)
    try: s.connect(('127.0.0.1', port)); s.close(); return True
    except: return False

def main():
    print("=" * 50)
    print("  雅檀怡家私城 · 管理后台启动器")
    print("=" * 50)

    # 1. 检查端口是否已被占用
    if check_port(5000):
        print("\n✅ 后端已在运行，直接打开管理面板...")
        webbrowser.open('http://localhost:5000/admin')
        input("按回车退出（后端保持运行）...")
        return

    # 2. 启动后端
    python = find_python()
    print(f"\n🟢 启动后端服务... (Python: {python})")

    proc = subprocess.Popen(
        [python, 'app.py'], cwd=BACKEND_DIR,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
    )

    # 3. 等待启动
    print("⏳ 等待后端就绪...", end='', flush=True)
    for _ in range(20):
        if check_port(5000):
            print(" ✅")
            break
        time.sleep(0.3)
        print('.', end='', flush=True)
    else:
        print("\n❌ 启动超时！请检查杀毒软件是否拦截了 python.exe")
        input("按回车退出...")
        return

    # 4. 打开浏览器
    print("\n📊 打开管理后台: http://localhost:5000/admin")
    print("🏠 前台页面:     http://localhost:5000/index.html")
    print("\n⚠ 关闭此窗口将停止后端服务。")
    print("=" * 50)

    webbrowser.open('http://localhost:5000/admin')

    # 5. 保持运行
    try:
        while proc.poll() is None:
            time.sleep(1)
    except KeyboardInterrupt:
        pass

    # 6. 清理
    print("\n🛑 正在关闭后端...")
    try:
        import urllib.request
        req = urllib.request.Request('http://localhost:5000/api/shutdown', method='POST', data=b'')
        urllib.request.urlopen(req, timeout=2)
    except: pass
    proc.terminate()
    print("✅ 已关闭。")

if __name__ == '__main__':
    main()
