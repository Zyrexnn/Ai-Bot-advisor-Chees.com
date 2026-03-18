import re
with open("debug_dom.html", "r", encoding="utf-8") as f:
    html = f.read()

# Find all divs with highlight class
highlights = re.findall(r'<div class=[\'"]([^\'"]*highlight[^\'"]*)[\'"]', html)
print("Highlights found:", highlights)
