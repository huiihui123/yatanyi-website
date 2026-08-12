"""
雅檀怡家私城 - PythonAnywhere 部署版
修改点：
  1. 数据库路径适配 PythonAnywhere
  2. 静态文件路径适配
  3. 默认生产模式
"""
import os
import sys

# PythonAnywhere 环境检测
IS_PA = os.path.exists('/var/run/apache2')

if IS_PA:
    # PythonAnywhere 的数据库路径（放在 /home/用户名/ 下）
    PROJECT_ROOT = '/home/yatanyi/mysite'
    BACKEND_DIR = '/home/yatanyi/mysite/backend'
else:
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

DB_PATH = os.path.join(BACKEND_DIR, 'yatanyi.db')
ORDERS_DIR = os.path.join(BACKEND_DIR, '订单文件')
os.makedirs(ORDERS_DIR, exist_ok=True)

# 确保 images 目录在后端可访问
IMAGES_DIR = os.path.join(PROJECT_ROOT, 'images')
os.makedirs(IMAGES_DIR, exist_ok=True)

from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from datetime import datetime, timedelta
import sqlite3, json, hashlib, uuid, random as _random

app = Flask(__name__, static_folder=None)
CORS(app)

# ====== 数据库工具 ======
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    # 咨询表
    c.execute('''CREATE TABLE IF NOT EXISTS consultations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
        consult_type TEXT, message TEXT, status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL, ip_address TEXT
    )''')
    
    # 订阅表
    c.execute('''CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, ip_address TEXT
    )''')
    
    # 产品表
    c.execute('''CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        category TEXT NOT NULL, price REAL NOT NULL, original_price REAL,
        description TEXT, image_url TEXT, rating REAL DEFAULT 4.5,
        review_count INTEGER DEFAULT 0, is_hot INTEGER DEFAULT 0,
        is_new INTEGER DEFAULT 0, created_at TEXT NOT NULL
    )''')
    
    # 用户表
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL, phone TEXT, email TEXT, avatar TEXT DEFAULT '',
        created_at TEXT NOT NULL, last_login TEXT
    )''')
    
    # 购物车表
    c.execute('''CREATE TABLE IF NOT EXISTS cart_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        product_name TEXT NOT NULL, product_price REAL NOT NULL,
        quantity INTEGER DEFAULT 1, image_url TEXT, added_at TEXT NOT NULL
    )''')
    
    # 订单表
    c.execute('''CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        username TEXT NOT NULL, items_json TEXT NOT NULL,
        total_amount REAL NOT NULL, status TEXT DEFAULT 'pending',
        xlsx_path TEXT, created_at TEXT NOT NULL
    )''')
    
    # 验证码表（忘记密码用）
    c.execute('''CREATE TABLE IF NOT EXISTS verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL,
        code TEXT NOT NULL, purpose TEXT NOT NULL,
        expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
        used INTEGER DEFAULT 0
    )''')
    
    conn.commit()
    conn.close()
    print("[数据库] 初始化完成 ✓")

# ====== 静态文件服务 ======
@app.route('/images/<path:filename>')
def serve_images(filename):
    """提供图片访问"""
    return send_from_directory(IMAGES_DIR, filename)

@app.route('/backend/images/<path:filename>')
def serve_backend_images(filename):
    """后端图片访问路径"""
    return send_from_directory(IMAGES_DIR, filename)

# ====== 健康检查 ======
@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'service': '雅檀怡家私城后端', 'timestamp': datetime.now().isoformat()})

# ====== 咨询表单 ======
@app.route('/api/consult', methods=['POST'])
def submit_consult():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    phone = (data.get('phone') or '').strip()
    if not name or not phone:
        return jsonify({'success': False, 'message': '姓名和电话不能为空'}), 400
    if len(name) > 50:
        return jsonify({'success': False, 'message': '姓名过长'}), 400
    if not phone.isdigit() or len(phone) != 11:
        return jsonify({'success': False, 'message': '手机号格式不正确'}), 400
    
    conn = get_db()
    c = conn.cursor()
    c.execute('INSERT INTO consultations (name,phone,email,consult_type,message,created_at,ip_address) VALUES (?,?,?,?,?,?,?)',
              (name, phone, data.get('email',''), data.get('consult_type',''), data.get('message',''), datetime.now().isoformat(), request.remote_addr or ''))
    conn.commit()
    new_id = c.lastrowid
    conn.close()
    return jsonify({'success': True, 'message': '提交成功！我们的设计师将在24小时内与您联系。', 'id': new_id})

# ====== 订阅 ======
@app.route('/api/subscribe', methods=['POST'])
def subscribe():
    data = request.get_json() or {}
    email = (data.get('email') or '').strip()
    if not email or '@' not in email:
        return jsonify({'success': False, 'message': '请输入有效的邮箱地址'}), 400
    
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT id FROM subscriptions WHERE email=?', (email,))
    if c.fetchone():
        conn.close()
        return jsonify({'success': True, 'message': '您已订阅，无需重复订阅'})
    c.execute('INSERT INTO subscriptions (email,created_at,ip_address) VALUES (?,?,?)',
              (email, datetime.now().isoformat(), request.remote_addr or ''))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': '订阅成功！感谢您的关注。'})

# ====== 数据统计 ======
@app.route('/api/stats')
def get_stats():
    conn = get_db()
    c = conn.cursor()
    today = datetime.now().strftime('%Y-%m-%d')
    
    c.execute('SELECT COUNT(*) FROM consultations')
    total_consult = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM consultations WHERE status='pending'")
    pending = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM consultations WHERE created_at LIKE ?", (today + '%',))
    today_new = c.fetchone()[0]
    c.execute('SELECT COUNT(*) FROM subscriptions')
    total_subs = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM subscriptions WHERE created_at LIKE ?", (today + '%',))
    today_subs = c.fetchone()[0]
    c.execute("SELECT COUNT(*) FROM consultations WHERE status='completed'")
    completed = c.fetchone()[0]
    conn.close()
    
    return jsonify({'success': True, 'data': {
        'total_consult': total_consult, 'pending': pending,
        'today_new': today_new, 'completed': completed,
        'total_subs': total_subs, 'today_subs': today_subs
    }})

# ====== 咨询管理 ======
@app.route('/api/admin/consultations')
def list_consultations():
    status = request.args.get('status', '')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    offset = (page - 1) * limit
    
    conn = get_db()
    c = conn.cursor()
    if status:
        c.execute('SELECT COUNT(*) FROM consultations WHERE status=?', (status,))
        total = c.fetchone()[0]
        c.execute('SELECT * FROM consultations WHERE status=? ORDER BY created_at DESC LIMIT ? OFFSET ?',
                  (status, limit, offset))
    else:
        c.execute('SELECT COUNT(*) FROM consultations')
        total = c.fetchone()[0]
        c.execute('SELECT * FROM consultations ORDER BY created_at DESC LIMIT ? OFFSET ?',
                  (limit, offset))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify({'success': True, 'data': rows, 'total': total, 'page': page, 'limit': limit})

@app.route('/api/admin/consultations/<int:cid>/status', methods=['PUT'])
def update_status(cid):
    data = request.get_json() or {}
    new_status = (data.get('status') or '').strip()
    if new_status not in ('pending', 'contacted', 'completed'):
        return jsonify({'success': False, 'message': '无效状态'}), 400
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE consultations SET status=? WHERE id=?', (new_status, cid))
    conn.commit()
    affected = c.rowcount
    conn.close()
    if affected == 0:
        return jsonify({'success': False, 'message': '记录不存在'}), 404
    return jsonify({'success': True, 'message': f'状态已更新为 {new_status}'})

@app.route('/api/admin/consultations/<int:cid>', methods=['DELETE'])
def delete_consultation(cid):
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM consultations WHERE id=?', (cid,))
    conn.commit()
    affected = c.rowcount
    conn.close()
    if affected == 0:
        return jsonify({'success': False, 'message': '记录不存在'}), 404
    return jsonify({'success': True, 'message': '记录已删除'})

# ====== 订阅管理 ======
@app.route('/api/admin/subscriptions')
def list_subscriptions():
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    offset = (page - 1) * limit
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM subscriptions')
    total = c.fetchone()[0]
    c.execute('SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT ? OFFSET ?', (limit, offset))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify({'success': True, 'data': rows, 'total': total, 'page': page, 'limit': limit})

@app.route('/api/admin/subscriptions/<int:sid>', methods=['DELETE'])
def delete_subscription(sid):
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM subscriptions WHERE id=?', (sid,))
    conn.commit()
    affected = c.rowcount
    conn.close()
    if affected == 0:
        return jsonify({'success': False, 'message': '记录不存在'}), 404
    return jsonify({'success': True, 'message': '订阅已删除'})

# ====== 管理端：用户 & 订单 ======
@app.route('/api/admin/users')
def admin_users():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT id,username,phone,email,created_at,last_login FROM users ORDER BY created_at DESC')
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify({'success': True, 'users': rows, 'total': len(rows)})

@app.route('/api/admin/orders')
def admin_orders():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM orders ORDER BY created_at DESC')
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify({'success': True, 'orders': rows, 'total': len(rows)})

# ====== 用户认证 ======
def _hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    phone = (data.get('phone') or '').strip()
    if not username or len(username) < 2:
        return jsonify({'success': False, 'message': '用户名至少2个字符'}), 400
    if not password or len(password) < 6:
        return jsonify({'success': False, 'message': '密码至少6位'}), 400
    
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT id FROM users WHERE username=?', (username,))
    if c.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': '用户名已存在'}), 400
    
    token = uuid.uuid4().hex
    c.execute('INSERT INTO users (username,password,phone,created_at,last_login) VALUES (?,?,?,?,?)',
              (username, _hash_pw(password), phone, datetime.now().isoformat(), datetime.now().isoformat()))
    user_id = c.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': '注册成功！', 'user': {'id': user_id, 'username': username, 'token': token}})

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE username=?', (username,))
    row = c.fetchone()
    if not row or row['password'] != _hash_pw(password):
        conn.close()
        return jsonify({'success': False, 'message': '用户名或密码错误'}), 401
    
    c.execute('UPDATE users SET last_login=? WHERE id=?', (datetime.now().isoformat(), row['id']))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': '登录成功！', 'user': {
        'id': row['id'], 'username': row['username'], 'phone': row['phone'],
        'email': row['email'], 'nickname': row['nickname'] or row['username']
    }})

# ====== 购物车 ======
@app.route('/api/cart', methods=['GET'])
def get_cart():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': '请先登录'}), 401
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM cart_items WHERE user_id=? ORDER BY added_at DESC', (user_id,))
    items = [dict(r) for r in c.fetchall()]
    total = sum(i['product_price'] * i['quantity'] for i in items)
    conn.close()
    return jsonify({'success': True, 'items': items, 'count': len(items), 'total': total})

@app.route('/api/cart', methods=['POST'])
def add_to_cart():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    product_name = data.get('product_name')
    product_price = data.get('product_price')
    quantity = int(data.get('quantity', 1))
    image_url = data.get('image_url', '')
    
    if not user_id or not product_name:
        return jsonify({'success': False, 'message': '参数不完整'}), 400
    
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT id,quantity FROM cart_items WHERE user_id=? AND product_name=?',
              (user_id, product_name))
    existing = c.fetchone()
    if existing:
        c.execute('UPDATE cart_items SET quantity=quantity+?, added_at=? WHERE id=?',
                  (quantity, datetime.now().isoformat(), existing['id']))
    else:
        c.execute('INSERT INTO cart_items (user_id,product_name,product_price,quantity,image_url,added_at) VALUES (?,?,?,?,?,?)',
                  (user_id, product_name, product_price, quantity, image_url, datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': '已加入购物车'})

@app.route('/api/cart/<int:cid>', methods=['PUT'])
def update_cart(cid):
    data = request.get_json() or {}
    qty = int(data.get('quantity', 1))
    if qty < 1:
        return jsonify({'success': False, 'message': '数量至少为1'}), 400
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE cart_items SET quantity=? WHERE id=?', (qty, cid))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/cart/<int:cid>', methods=['DELETE'])
def delete_cart(cid):
    conn = get_db()
    c = conn.cursor()
    c.execute('DELETE FROM cart_items WHERE id=?', (cid,))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': '已移除'})

# ====== 订单 ======
def _generate_order_xlsx(order_id, username, items, total):
    try:
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.title = f'订单_{order_id}'
        ws['A1'] = '订单编号'; ws['B1'] = order_id
        ws['A2'] = '客户姓名'; ws['B2'] = username
        ws['A3'] = '下单时间'; ws['B3'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ws['A5'] = '产品名称'; ws['B5'] = '单价'; ws['C5'] = '数量'; ws['D5'] = '小计'
        row = 6
        for item in items:
            ws.cell(row, 1, item.get('product_name', ''))
            ws.cell(row, 2, item.get('product_price', 0))
            ws.cell(row, 3, item.get('quantity', 1))
            ws.cell(row, 4, item.get('product_price', 0) * item.get('quantity', 1))
            row += 1
        ws.cell(row + 1, 1, '合计'); ws.cell(row + 4, total)
        filename = f'order_{order_id}_{username}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
        filepath = os.path.join(ORDERS_DIR, filename)
        wb.save(filepath)
        return filepath
    except Exception as e:
        print(f'[xlsx] 生成失败: {e}')
        return None

@app.route('/api/orders', methods=['POST'])
def create_order():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    username = data.get('username', '未知用户')
    if not user_id:
        return jsonify({'success': False, 'message': '请先登录'}), 401
    
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM cart_items WHERE user_id=?', (user_id,))
    cart_items = [dict(r) for r in c.fetchall()]
    if not cart_items:
        conn.close()
        return jsonify({'success': False, 'message': '购物车为空'}), 400
    
    items_data = [{'product_name': i['product_name'], 'product_price': i['product_price'],
                   'quantity': i['quantity'], 'image_url': i.get('image_url', '')} for i in cart_items]
    total = sum(i['product_price'] * i['quantity'] for i in cart_items)
    
    c.execute('INSERT INTO orders (user_id,username,items_json,total_amount,created_at) VALUES (?,?,?,?,?)',
              (user_id, username, json.dumps(items_data, ensure_ascii=False), total, datetime.now().isoformat()))
    order_id = c.lastrowid
    
    xlsx_path = _generate_order_xlsx(order_id, username, items_data, total)
    if xlsx_path:
        c.execute('UPDATE orders SET xlsx_path=? WHERE id=?', (xlsx_path, order_id))
    
    c.execute('DELETE FROM cart_items WHERE user_id=?', (user_id,))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': f'下单成功！共{len(cart_items)}件，¥{total}',
                    'order_id': order_id, 'total': total, 'item_count': len(cart_items)})

@app.route('/api/orders', methods=['GET'])
def get_orders():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': '请先登录'}), 401
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC', (user_id,))
    orders = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify({'success': True, 'orders': orders})

# ====== 产品搜索 ======
@app.route('/api/products/search')
def search_products():
    q = request.args.get('q', '')
    category = request.args.get('category', '')
    sort = request.args.get('sort', '')
    
    conn = get_db()
    c = conn.cursor()
    sql = 'SELECT * FROM products WHERE 1=1'
    params = []
    if q:
        sql += ' AND name LIKE ?'
        params.append(f'%{q}%')
    if category:
        sql += ' AND category=?'
        params.append(category)
    if sort == 'price_asc':
        sql += ' ORDER BY price ASC'
    elif sort == 'price_desc':
        sql += ' ORDER BY price DESC'
    elif sort == 'rating':
        sql += ' ORDER BY rating DESC'
    else:
        sql += ' ORDER BY id DESC'
    c.execute(sql, params)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify({'success': True, 'products': rows, 'total': len(rows)})

# ====== 下载订单 xlsx ======
@app.route('/api/admin/orders/<int:oid>/xlsx')
def download_xlsx(oid):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT xlsx_path FROM orders WHERE id=?', (oid,))
    row = c.fetchone()
    conn.close()
    if not row or not row['xlsx_path'] or not os.path.exists(row['xlsx_path']):
        return jsonify({'success': False, 'message': '文件不存在'}), 404
    return send_file(row['xlsx_path'], as_attachment=True, download_name=os.path.basename(row['xlsx_path']))

# ====== 管理后台页面 ======
@app.route('/admin')
@app.route('/admin/')
def admin_panel():
    admin_html = os.path.join(BACKEND_DIR, 'admin.html')
    if os.path.exists(admin_html):
        return send_from_directory(BACKEND_DIR, 'admin.html')
    return '<h1>管理后台文件未找到</h1>', 404

# ====== 初始化 ======
init_db()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("=" * 60)
    print("  雅檀怡家私城 - 后端服务")
    print(f"  模式: {'PythonAnywhere' if IS_PA else '本地开发'}")
    print(f"  数据库: {DB_PATH}")
    print("=" * 60)
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
