# -*- coding: utf-8 -*-
"""
从 index.html 静态产品卡片提取产品数据，生成 products_seed.json
（产品管理后台 + 前台动态渲染的数据源）
"""
import re, json, os

BASE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(os.path.dirname(BASE), 'index.html')

html = open(INDEX, encoding='utf-8').read()

# 定位产品区
start = html.index('<section class="products"')
end = html.index('<!-- .products-grid: 产品展示网格结束 -->') + len('<!-- .products-grid: 产品展示网格结束 -->')
section = html[start:end]

# 卡片正则
card_re = re.compile(
    r'<div class="product-card" data-category="([a-z]+)">'
    r'(?P<body>.*?)</div>\s*</div>\s*</div>',
    re.S
)

products = []
for m in card_re.finditer(section):
    cat = m.group(1)
    body = m.group('body')
    img = re.search(r'<img src="([^"]+)"', body)
    name = re.search(r'<h3>([^<]+)</h3>', body)
    desc = re.search(r'class="product-desc">([^<]*)</p>', body)
    price = re.search(r'current-price">¥([^<]+)</span>', body)
    orig = re.search(r'original-price">¥([^<]+)</span>', body)
    stars = body.count('<i class="fas fa-star"></i>')
    half = 1 if 'fa-star-half-alt' in body else 0
    rating = stars + half * 0.5
    rc = re.search(r'rating-count">\((\d+)\)', body)
    tag = re.search(r'product-tag[^>]*>([^<]+)<', body)

    if not (img and name and price):
        continue
    products.append({
        'name': name.group(1).strip(),
        'category': cat,
        'price': float(price.group(1).replace(',', '')),
        'original_price': float(orig.group(1).replace(',', '')) if orig else None,
        'description': desc.group(1).strip() if desc else '',
        'image_url': img.group(1),
        'rating': rating,
        'review_count': int(rc.group(1)) if rc else 0,
        'is_hot': 1 if tag and tag.group(1) == '热销' else 0,
        'is_new': 1 if tag and tag.group(1) == '新品' else 0,
    })

out = os.path.join(BASE, 'products_seed.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(products, f, ensure_ascii=False, indent=2)

print(f"解析完成：{len(products)} 个产品 → {out}")
for p in products:
    flag = 'HOT' if p['is_hot'] else ('NEW' if p['is_new'] else '   ')
    print(f"  {flag} [{p['category']}] {p['name']} {p['price']} 评分{p['rating']}")
