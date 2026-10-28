# -*- coding: utf-8 -*-
"""把 src 下的模板、样式、脚本与 three.js 打包成一个可离线双击打开的 HTML。"""
import os, io

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, '啤酒发酵工厂·生产流程课件.html')
OUT_INDEX = os.path.join(ROOT, 'index.html')   # 供 GitHub Pages 直接访问

JS_FILES = ['00-data.js', '01-util.js', '10-scene.js', '15-post.js',
            '20-factory.js', '30-fx.js', '35-run.js', '50-ui.js']


def read(p):
    with io.open(p, 'r', encoding='utf-8') as f:
        return f.read()


html = read(os.path.join(SRC, 'index.html'))
css = read(os.path.join(SRC, 'style.css'))
three = read(os.path.join(ROOT, 'src', 'vendor', 'three.min.js'))
app = '\n'.join('/* ---- %s ---- */\n' % f + read(os.path.join(SRC, f)) for f in JS_FILES)

for name, blob in (('three.min.js', three), ('app', app), ('css', css)):
    if '</script' in blob.lower():
        raise SystemExit('!! %s 含有 </script 字面量，会截断内联脚本' % name)

html = html.replace('/*__CSS__*/', css)
html = html.replace('/*__THREE__*/', three)
html = html.replace('/*__APP__*/', app)

for path in (OUT, OUT_INDEX):
    with io.open(path, 'w', encoding='utf-8') as f:
        f.write(html)
    print('OK ->', path)
print('size: %.2f MB' % (os.path.getsize(OUT) / 1048576.0))
