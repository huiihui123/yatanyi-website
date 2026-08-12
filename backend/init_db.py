"""
雅檀怡家私城 — 数据库初始化脚本 v3.0
====================================
新增：
  users扩展 — 昵称/性别/年龄/地区/签名/头像
  verification_codes — 验证码（忘记密码用）
"""
import sqlite3, sys, os, hashlib
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'yatanyi.db')

def create_tables(conn):
    c = conn.cursor()

    # ---- 客户咨询预约 ----
    c.execute('''CREATE TABLE IF NOT EXISTS consultations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
        email TEXT, consult_type TEXT, message TEXT, status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL, ip_address TEXT)''')

    # ---- 新闻订阅 ----
    c.execute('''CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL, ip_address TEXT)''')

    # ---- 产品 ----
    c.execute('''CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        category TEXT NOT NULL, price REAL NOT NULL, original_price REAL,
        description TEXT, image_url TEXT, rating REAL DEFAULT 4.5,
        review_count INTEGER DEFAULT 0, is_hot INTEGER DEFAULT 0,
        is_new INTEGER DEFAULT 0, created_at TEXT NOT NULL)''')

    # ★★★ 用户表（含个人资料字段） ★★★
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        nickname TEXT DEFAULT '',
        gender TEXT DEFAULT '',
        age INTEGER DEFAULT 0,
        region TEXT DEFAULT '',
        signature TEXT DEFAULT '',
        avatar TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        last_login TEXT)''')

    # 兼容旧表：如果缺少新字段则补充
    for col, typ in [('nickname','TEXT DEFAULT ""'),('gender','TEXT DEFAULT ""'),
                     ('age','INTEGER DEFAULT 0'),('region','TEXT DEFAULT ""'),
                     ('signature','TEXT DEFAULT ""')]:
        try: c.execute(f'ALTER TABLE users ADD COLUMN {col} {typ}')
        except: pass

    # ★★★ 验证码表 ★★★
    c.execute('''CREATE TABLE IF NOT EXISTS verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT DEFAULT 'reset_password',
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT NOT NULL)''')

    # ---- 购物车 ----
    c.execute('''CREATE TABLE IF NOT EXISTS cart_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        product_price REAL NOT NULL,
        quantity INTEGER DEFAULT 1,
        image_url TEXT,
        added_at TEXT NOT NULL)''')

    # ---- 订单 ----
    c.execute('''CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        items_json TEXT NOT NULL,
        total_amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        xlsx_path TEXT,
        created_at TEXT NOT NULL)''')

    conn.commit()
    print("[数据库] 全部表创建/迁移完成 ✓")

def seed_data(conn):
    c = conn.cursor()
    pw = hashlib.sha256(b'123456').hexdigest()
    c.execute("INSERT OR IGNORE INTO users (username,password,phone,email,nickname,created_at) VALUES (?,?,?,?,?,?)",
              ('test', pw, '13800000000', 'test@test.com', '测试用户', datetime.now().isoformat()))
    products = [
        ('现代简约布艺沙发','sofa',3999,5299,'进口棉麻面料，高密度海绵，L型组合',4.5,118),
        ('意式极简真皮沙发','sofa',8999,12800,'头层牛皮，高回弹海绵，极简线条',5.0,86),
        ('北欧实木双人床','bed',5299,6599,'北美白橡木，稳固排骨架',4.5,86),
        ('现代简约真皮软床','bed',7899,9800,'进口头层牛皮，高箱储物',4.0,215),
        ('现代实木餐桌椅套装','table',4599,5999,'胡桃木，一桌四椅，可伸缩',4.5,215),
        ('岩板伸缩餐桌','table',3899,5200,'12mm进口岩板，耐刮耐热',4.0,256),
        ('实木推拉门衣柜','storage',6999,8299,'橡木框架，环保板材，大容量',4.0,238),
        ('北欧五斗柜储物柜','storage',2899,3600,'全实木抽屉，金属滑轨',4.0,156),
    ]
    for name, cat, price, orig, desc, rating, reviews in products:
        c.execute('''INSERT OR IGNORE INTO products (name,category,price,original_price,description,rating,review_count,created_at)
                     VALUES (?,?,?,?,?,?,?,?)''',
                  (name,cat,price,orig,desc,rating,reviews,datetime.now().isoformat()))
    conn.commit()
    print(f"[数据库] 种子数据: 1用户 + {len(products)}产品 ✓")

def main():
    reset = '--reset' in sys.argv
    seed = '--seed' in sys.argv
    if reset and os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print("[数据库] 旧库已删除")
    conn = sqlite3.connect(DB_PATH)
    create_tables(conn)
    if seed or reset:
        seed_data(conn)
    conn.close()
    print(f"[数据库] 位置: {DB_PATH}")

if __name__ == '__main__':
    main()
