import re

with open("debug_dom.html", "r", encoding="utf-8") as f:
    html = f.read()

# Try to find elements with class like 'move' or containing standard chess notation
# Or find wc-move-list
print("wc-move-list present?", "wc-move-list" in html)
print("move-list present?", "move-list" in html)
