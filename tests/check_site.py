"""Check local page links/assets and duplicate IDs without third-party packages."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.links = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            assert attrs['id'] not in self.ids, f'Duplicate ID: {attrs["id"]}'
            self.ids.add(attrs['id'])
        for attr in ('href', 'src'):
            if attr in attrs:
                self.links.append(attrs[attr])

pages = {}
for path in ROOT.rglob('*.html'):
    page = Page()
    page.feed(path.read_text())
    pages[path] = page
for path, page in pages.items():
    for link in page.links:
        url = urlsplit(link)
        if url.scheme or url.netloc:
            continue
        target = ((ROOT / unquote(url.path).lstrip('/')) if url.path.startswith('/')
                  else path.parent / unquote(url.path)) if url.path else path
        if target.is_dir():
            target /= 'index.html'
        assert target.is_file(), f'{path.relative_to(ROOT)}: broken link {link}'
        if url.fragment and target in pages:
            assert url.fragment in pages[target].ids, f'Broken fragment: {link}'
assert (ROOT / 'CNAME').read_text().strip() == 'www.sparktacus.io'
assert (ROOT / '.nojekyll').exists()
print(f'Passed: local links, assets, fragments, IDs and domain across {len(pages)} pages.')
