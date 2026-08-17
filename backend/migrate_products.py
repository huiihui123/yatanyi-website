# -*- coding: utf-8 -*-
"""
一次性迁移脚本：将前台 36 个静态产品导入数据库 products 表
（products 表此前只有 8 条种子数据且前台未使用，直接清空重建保证一致）
用法：python migrate_products.py
"""
import sqlite3, os, json, sys
from datetime import datetime

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, 'yatanyi.db')
SEED = os.path.join(BASE, 'products_seed.json')

if not os.path.exists(SEED):
    print('[错误] products_seed.json 不存在，请先运行 parse_products.py')
    sys.exit(1)

conn = sqlite3.connect(DB)
c = conn.cursor()

# 老库迁移：补 is_active 列
cols = [r[1] for r in c.execute('PRAGMA table_info(products)').fetchall()]
if 'is_active' not in cols:
    c.execute('ALTER TABLE products ADD COLUMN is_active INTEGER DEFAULT 1')

# 清空旧产品数据（products 无外键引用，购物车/订单存的是文本快照，不受影响）
c.execute('DELETE FROM products')

products = json.load(open(SEED, encoding='utf-8'))
now = datetime.now().isoformat()
for p in products:
    c.execute('''INSERT INTO products (name, category, price, original_price, description,
                 image_url, rating, review_count, is_hot, is_new, is_active, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)''',
              (p['name'], p['category'], p['price'], p.get('original_price'),
               p.get('description', ''), p.get('image_url', ''),
               p.get('rating', 4.5), p.get('review_count', 0),
               p.get('is_hot', 0), p.get('is_new', 0), 1, now))
conn.commit()

total = c.execute('SELECT COUNT(*) FROM products').fetchone()[0]
hot = c.execute('SELECT COUNT(*) FROM products WHERE is_hot=1').fetchone()[0]
print(f'[完成] 产品表已重建：{total} 个产品（热销 {hot} 个），数据库: {DB}')
conn.close()
