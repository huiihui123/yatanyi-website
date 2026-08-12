"""
PythonAnywhere WSGI 配置文件
路径：/var/www/yatanyi_pythonanywhere_com_wsgi.py
"""
import sys
import os

# 添加项目路径
project_home = '/home/yatanyi/mysite/backend'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# 导入 Flask app
from app_pa import app as application
