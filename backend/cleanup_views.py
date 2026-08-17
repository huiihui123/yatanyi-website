# -*- coding: utf-8 -*-
"""清理浏览历史残留表（已改为 localStorage 方案）"""
import sqlite3, os, sys

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yatanyi.db')
conn = sqlite3.connect(DB)
c = conn.cursor()
c.execute('DROP TABLE IF EXISTS product_views')
conn.commit()
tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
print('剩余表:', tables)
conn.close()
