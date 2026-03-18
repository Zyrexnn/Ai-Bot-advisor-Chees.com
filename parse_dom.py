import html.parser
import re

class MyHTMLParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.board = None
        self.pieces = []

    def handle_starttag(self, tag, attrs):
        attr_dict = dict(attrs)
        
        # Check if it's the board
        if attr_dict.get('id') == 'board-play-computer' or tag == 'chess-board' or tag == 'wc-chess-board':
            self.board = f"<{tag} " + " ".join(f"{k}='{v}'" for k, v in attrs) + ">"
            
        # Check if it looks like a piece
        if attr_dict.get('class'):
            cls = attr_dict['class']
            if 'piece' in cls or re.search(r'\b[wb][prnbkq]\b', cls):
                self.pieces.append(f"<{tag} class='{cls}' ...>")

parser = MyHTMLParser()
with open("debug_dom.html", "r", encoding="utf-8") as f:
    parser.feed(f.read())

print("BOARD:", parser.board)
print("PIECES FOUND:", len(parser.pieces))
for p in parser.pieces[:10]:
    print("  ", p)
