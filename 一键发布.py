# -*- coding: utf-8 -*-
"""
雅檀怡家私城 — 一键发布工具 v1.0
=================================
双击运行，自动完成：
  ① 提交所有代码改动到 git（自动生成提交说明）
  ② 更新 index.html 的缓存版本号（格式：日期-最新提交号，preload/link 自动同步）
  ③ 提交版本号变更
  ④ 推送代码到 GitHub（origin）
  ⑤ 打印同步服务器的下一步操作提示

用法：双击运行，或命令行执行 python 一键发布.py
     --dry-run  仅预览，不实际执行（调试用）
"""
import os
import re
import sys
import subprocess
import datetime

# ★ Windows 控制台默认 GBK，统一 UTF-8 输出（与 backend/app.py 一致）
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

DRY_RUN = '--dry-run' in sys.argv

# ========== 项目目录定位（脚本放哪都能用） ==========
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if os.path.isdir(os.path.join(_SCRIPT_DIR, 'backend')):
    PROJECT_DIR = _SCRIPT_DIR                       # ① 脚本同目录有 backend
elif os.path.isdir(r'F:\zhuomian\jtyjsc\backend'):
    PROJECT_DIR = r'F:\zhuomian\jtyjsc'           # ② 兜底：已知项目路径
else:
    PROJECT_DIR = os.getcwd()                       # ③ 最后：当前目录
INDEX = os.path.join(PROJECT_DIR, 'index.html')


def run_git(args, check=True):
    """执行 git 命令，返回 (returncode, stdout, stderr)"""
    try:
        r = subprocess.run(
            ['git'] + args, cwd=PROJECT_DIR,
            capture_output=True, text=True,
            encoding='utf-8', errors='replace', timeout=60,
        )
        return r.returncode, (r.stdout or '').strip(), (r.stderr or '').strip()
    except Exception as e:
        return -1, str(e), ''


def step(title):
    """打印分步标题"""
    print()
    print('=' * 56)
    print(f'  {title}')
    print('=' * 56)


def get_head_hash():
    """读取最新 git 提交短哈希"""
    rc, out, _ = run_git(['rev-parse', '--short', 'HEAD'])
    return out if rc == 0 else None


def update_version_number():
    """更新 index.html 版本号为「日期-最新提交号」，preload/link 自动同步"""
    if not os.path.exists(INDEX):
        print('❌ 未找到 index.html')
        return False
    h = get_head_hash()
    if not h:
        print('⚠️  无法读取 git 提交号，改用日期时间')
        h = datetime.datetime.now().strftime('%H%M')
    new_v = f"{datetime.datetime.now().strftime('%Y%m%d')}-{h}"
    with open(INDEX, 'r', encoding='utf-8', newline='') as f:
        content = f.read()
    old_versions = sorted(set(re.findall(r'\?v=[A-Za-z0-9_\-]+', content)))
    new_content = re.sub(r'\?v=[A-Za-z0-9_\-]+', f'?v={new_v}', content)
    with open(INDEX, 'w', encoding='utf-8', newline='') as f:
        f.write(new_content)
    print(f'✅ 版本号已更新: {", ".join(old_versions)} → v={new_v}')
    return True


def make_commit_message():
    """根据暂存文件自动生成中文提交说明"""
    # ★ -c core.quotepath=false：让 git 输出原始中文文件名（否则是八进制转义，无法识别扩展名）
    rc, files, _ = run_git(['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only'])
    kinds, ext_map = [], {
        '.css': '样式', '.js': '脚本', '.html': '页面', '.py': '后端',
        '.md': '文档', '.txt': '文档',
        '.jpg': '图片素材', '.jpeg': '图片素材', '.png': '图片素材', '.gif': '图片素材',
    }
    for f in (files or '').splitlines():
        kind = ext_map.get(os.path.splitext(f)[1].lower(), '内容')
        if kind not in kinds:
            kinds.append(kind)
    label = '、'.join(kinds) if kinds else '网站内容'
    return f'自动发布：更新{label}（{datetime.datetime.now().strftime("%m-%d %H:%M")}）'


def main():
    print(f'📍 项目目录: {PROJECT_DIR}')
    if DRY_RUN:
        print('🧪 干跑模式（--dry-run）：仅预览，不实际执行')
        print()

    # ---- ① 提交代码改动 ----
    step('步骤 1/5：提交代码改动到 git')
    if DRY_RUN:
        print('（跳过：git add -A + commit）')
    else:
        run_git(['add', '-A'])
        rc, _, _ = run_git(['diff', '--cached', '--quiet'])
        if rc == 0:   # 没有任何变更
            print('ℹ️  没有检测到任何改动，无需提交。')
            print('    （提示：如果你改了代码，请确认保存了文件）')
            return
        msg = make_commit_message()
        rc2, _, err2 = run_git(['commit', '-m', msg])
        if rc2 != 0:
            print(f'❌ 提交失败: {err2}')
            return
        print(f'✅ 已提交: {msg}')

    # ---- ② 更新版本号 ----
    step('步骤 2/5：更新缓存版本号')
    if DRY_RUN:
        print('（跳过：更新 index.html 版本号）')
    else:
        update_version_number()

    # ---- ③ 提交版本号变更 ----
    step('步骤 3/5：提交版本号变更')
    if DRY_RUN:
        print('（跳过：git add index.html + commit）')
    else:
        run_git(['add', INDEX])
        rc, _, _ = run_git(['diff', '--cached', '--quiet'])
        if rc != 0:
            h = get_head_hash() or 'version'
            rc2, _, err2 = run_git(['commit', '-m', f'更新缓存版本号至提交 {h}'])
            if rc2 != 0:
                print(f'❌ 版本号提交失败: {err2}')
                return
            print(f'✅ 版本号已提交')
        else:
            print('ℹ️  版本号无变化，跳过')

    # ---- ④ 推送 GitHub ----
    step('步骤 4/5：推送代码到 GitHub')
    if DRY_RUN:
        print('（跳过：git push）')
    else:
        rc, branch, _ = run_git(['branch', '--show-current'])
        branch = branch or 'main'
        rc2, _, err2 = run_git(['push', 'origin', branch])
        if rc2 != 0:
            print('❌ 推送失败，本地提交已保存，不会丢失。常见原因：')
            print('   ① 网络不通（GitHub 在国内不稳定）→ 检查网络/代理后重试')
            print('   ② 未登录 GitHub → 命令行先执行: git push origin main 完成登录')
            print(f'   错误信息: {err2}')
            return
        print(f'✅ 已推送至 GitHub（分支: {branch}）')

    # ---- ⑤ 服务器同步提示 ----
    step('步骤 5/5：同步服务器（PythonAnywhere）')
    print('''   代码已推送到 GitHub。请到 PythonAnywhere 完成最后一步：
   方式一（推荐，若已配置 Git 部署）：
     打开 https://www.pythonanywhere.com → Web 标签 → 你的应用
     → 点 "Update from Git"（或 Reload 按钮）
   方式二（Bash 手动拉取）：
     打开 PythonAnywhere 的 Bash 控制台，运行：
       cd ~/mysite && git pull
     然后回到 Web 标签点 Reload。
   💡 部署完成后，浏览器按 Ctrl+F5 强制刷新一次即可看到新版。''')

    print()
    print('🎉 一键发布完成！')


if __name__ == '__main__':
    main()
