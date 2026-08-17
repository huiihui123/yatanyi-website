# -*- coding: utf-8 -*-
"""
一键更新缓存版本号工具
========================
作用：自动把 index.html 中所有 CSS/JS 引用的版本号 (?v=xxx) 统一替换为
      「日期-最新git提交号」格式，例如 v=20260818-fd04b01。
      preload 与 link 两处引用自动同步，杜绝手工改版本号漏改/记错。

推荐流程（配合 git）：
    1. 改完 CSS/JS 文件 → git add / git commit（提交后哈希号才会变）
    2. 双击运行本脚本 → 版本号自动更新为新提交号
    3. 上传部署 → 用户浏览器自动请求新文件

用法：双击运行，或在命令行执行 python 更新版本号.py
"""
import os, re, subprocess, sys, datetime

# ★ Windows 控制台默认 GBK 编码，输出 emoji/中文会报 UnicodeEncodeError，
#   统一改为 UTF-8 输出
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(ROOT, 'index.html')


def get_git_hash():
    """读取最新 git 提交的短哈希；不是 git 仓库或出错时返回 None"""
    try:
        out = subprocess.run(
            ['git', 'rev-parse', '--short', 'HEAD'],
            cwd=ROOT, capture_output=True, text=True, timeout=5,
        )
        if out.returncode == 0:
            return out.stdout.strip()
    except Exception:
        pass
    return None


def main():
    # 检查 index.html 是否存在
    if not os.path.exists(INDEX):
        print('❌ 未找到 index.html，请把本脚本放在项目根目录运行')
        return

    # 生成新版本号：日期-短哈希（git 不可用时回退为 日期-时间）
    today = datetime.datetime.now().strftime('%Y%m%d')
    h = get_git_hash()
    if h:
        new_v = f'{today}-{h}'
        print(f'📦 读取到最新 git 提交号: {h}')
        print(f'   （注意：改完文件必须先 git commit，哈希才会更新）')
    else:
        t = datetime.datetime.now().strftime('%H%M')
        new_v = f'{today}-{t}'
        print('⚠️  未检测到 git 提交号，改用日期时间作为版本号')

    # 读取 index.html（newline='' 保留原有 CRLF/LF 行尾）
    with open(INDEX, 'r', encoding='utf-8', newline='') as f:
        content = f.read()

    # 找出所有旧版本号（去重展示）
    old_versions = sorted(set(re.findall(r'\?v=[A-Za-z0-9_\-]+', content)))
    if not old_versions:
        print('❌ index.html 中没有找到 ?v= 版本号，请检查文件内容')
        return
    print(f'替换前版本号: {", ".join(old_versions)}')

    # 统计替换处数（替换前先数一遍）
    total = len(re.findall(r'\?v=', content))

    # 统一替换为新的版本号（preload 与 link 一起被替换，自动同步）
    new_content = re.sub(r'\?v=[A-Za-z0-9_\-]+', f'?v={new_v}', content)
    with open(INDEX, 'w', encoding='utf-8', newline='') as f:
        f.write(new_content)

    # 输出结果
    print(f'✅ 已更新 {total} 处引用（CSS/JS 的 preload 与 link 已自动同步）')
    print(f'   index.html: {", ".join(old_versions)}  →  v={new_v}')
    print('💡 下一步：上传部署后，浏览器按 Ctrl+F5 刷新一次即可确认生效。')


if __name__ == '__main__':
    main()
