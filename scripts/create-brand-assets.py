"""Maintainer-only export of Circuitera's original code-native vector mark.
Requires CairoSVG and Pillow; not part of the site build or browser runtime.
The exact same SVG geometry supplies the header, logo exports and favicons.
"""
from pathlib import Path
from PIL import Image
import cairosvg
import shutil

public = Path(__file__).resolve().parent.parent / 'public'
brand = public / 'brand'
brand.mkdir(exist_ok=True)

def mark(blue='#2563ed'):
    return f'<path d="M24 8H14L8 14V24H24" fill="none" stroke="{blue}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="8" r="3.5" fill="#08b6d1"/><circle cx="24" cy="24" r="3.5" fill="#67cf49"/>'

def svg(body, width, height, viewbox=None):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{viewbox or f"0 0 {width} {height}"}">{body}</svg>\n'

def export(name, content, png=True):
    path = brand / f'{name}.svg'
    path.write_text(content)
    if png:
        cairosvg.svg2png(bytestring=content.encode(), write_to=str(brand / f'{name}.png'))

# Transparent, font-free icons for the application and reuse.
export('circuitera-icon', svg(mark(), 512, 512, '0 0 32 32'))
export('circuitera-icon-dark', svg(mark('#60a5fa'), 512, 512, '0 0 32 32'))
for mode, bg, ink, blue in [('light', '#faf8f3', '#253043', '#2563ed'), ('dark', '#080a0d', '#f4f6fa', '#60a5fa')]:
    icon = svg(f'<rect width="32" height="32" fill="{bg}"/>{mark(blue)}', 512, 512, '0 0 32 32')
    export(f'circuitera-icon-{mode}-512', icon)
    wordmark = f'<rect width="420" height="96" rx="0" fill="{bg}"/><g transform="translate(8 16) scale(2)">{mark(blue)}</g><text x="87" y="64" font-family="DejaVu Sans" font-size="51" font-weight="bold" letter-spacing="-1.7" fill="{ink}">Circuitera</text>'
    export(f'circuitera-wordmark-{mode}', svg(wordmark, 420, 96))

source = Image.open(brand / 'circuitera-icon-light-512.png').convert('RGBA')
source.save(brand / 'circuitera-favicon-source-512.png')
for size in (16, 32, 48, 192):
    source.resize((size, size), Image.Resampling.LANCZOS).save(public / f'favicon-{size}.png')
shutil.copyfile(public / 'favicon-32.png', public / 'favicon.png')
source.resize((180, 180), Image.Resampling.LANCZOS).save(public / 'apple-touch-icon.png')
source.save(public / 'favicon.ico', sizes=[(16,16),(32,32),(48,48)])
adaptive = '<style>.trace{stroke:#2563ed}.tile{fill:#faf8f3}@media(prefers-color-scheme:dark){.trace{stroke:#60a5fa}.tile{fill:#080a0d}}</style><rect class="tile" width="32" height="32" rx="5"/>' + mark().replace('<path ', '<path class="trace" ')
(public / 'favicon.svg').write_text(svg(adaptive, 32, 32))

social = f'''<rect width="1200" height="630" fill="#faf8f3"/>
<path d="M1050 0V82L1100 132H1200M1200 516H1110L1050 576V630" fill="none" stroke="#dfe3e9" stroke-width="2"/>
<circle cx="1050" cy="82" r="5" fill="#08b6d1"/><circle cx="1110" cy="516" r="5" fill="#a278da"/>
<g transform="translate(65 59) scale(2.2)">{mark()}</g>
<text x="150" y="112" fill="#253043" font-family="DejaVu Sans" font-weight="bold" font-size="43" letter-spacing="-1.2">Circuitera</text>
<text x="76" y="260" fill="#253043" font-family="DejaVu Sans" font-weight="bold" font-size="66" letter-spacing="-2">Build hardware</text>
<text x="76" y="345" fill="#253043" font-family="DejaVu Sans" font-weight="bold" font-size="66" letter-spacing="-2">from your browser.</text>
<text x="80" y="409" fill="#647085" font-family="DejaVu Sans" font-size="23">A fast, browser-based development environment for Arduino Uno.</text>
<rect x="80" y="485" width="166" height="45" rx="6" fill="#2563ed"/><text x="108" y="514" fill="white" font-family="DejaVu Sans" font-size="17">Local compiler</text>
<rect x="258" y="485" width="166" height="45" rx="6" fill="#67cf49"/><text x="282" y="514" fill="#122d1c" font-family="DejaVu Sans" font-size="17">Physical upload</text>
<text x="834" y="514" fill="#647085" font-family="DejaVu Sans Mono" font-size="17">UNO R3 · ATmega328P</text>'''
export('circuitera-social', svg(social, 1200, 630))
print('Exported original Circuitera SVG/PNG logos, 512px favicon source, 16/32/48/192px PNGs, ICO, touch icon and 1200×630 social image.')
