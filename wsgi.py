"""
PythonAnywhere WSGI 配置文件
路径：/var/www/你的用户名_pythonanywhere_com_wsgi.py
"""
import sys
import os

# 自动获取 HOME 目录
HOME_DIR = os.environ.get('HOME', os.path.expanduser('~'))
project_home = os.path.join(HOME_DIR, 'mysite', 'backend')
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# 导入 Flask app
from app_pa import app as application
