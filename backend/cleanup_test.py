# -*- coding: utf-8 -*-
"""清理本次检测/修复过程中产生的测试数据（可安全重复执行）"""
import sqlite3, os, sys

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yatanyi.db')
conn = sqlite3.connect(DB)
c = conn.cursor()

# 测试用户（bugtest*/secure* 前缀）
test_users = [r[0] for r in c.execute(
    "SELECT id FROM users WHERE username LIKE 'bugtest%' OR username LIKE 'secure%'")]
if test_users:
    marks = ','.join('?' * len(test_users))
    c.execute(f"DELETE FROM orders WHERE user_id IN ({marks})", test_users)
    c.execute(f"DELETE FROM cart_items WHERE user_id IN ({marks})", test_users)
    c.execute(f"DELETE FROM users WHERE id IN ({marks})", test_users)
    print(f'已清理测试用户 {len(test_users)} 个及关联订单/购物车')

# 测试咨询
cur = c.execute("DELETE FROM consultations WHERE name='测试咨询' AND phone='13812345678'")
print(f'已清理测试咨询 {cur.rowcount} 条')

# 测试订阅
cur = c.execute("DELETE FROM subscriptions WHERE email='test@test.com'")
print(f'已清理测试订阅 {cur.rowcount} 条')

# 过期验证码
cur = c.execute("DELETE FROM verification_codes WHERE expires_at < datetime('now')")
print(f'已清理过期验证码 {cur.rowcount} 条')

conn.commit()
for t in ['users', 'consultations', 'subscriptions', 'orders', 'cart_items']:
    print(f'{t}: {c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]} 条')
conn.close()
print('清理完成 ✓')
