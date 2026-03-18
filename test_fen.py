from stockfish import Stockfish

stockfish = Stockfish(path="stockfish.exe")
print("Stockfish loaded")

fen_list = [
    "8/2r1bp1k/3p1np1/p2Pp2p/4P3/1P2B2P/P3NPP1/R2QK2R w KQkq - 0 1", # Valid
    "8/2r1bp1k/3p1np1/p2Pp2p/4P3/1P2B2P/P3NPP1/R2Q3R w KQkq - 0 1",  # No White King
    "8/2r1bp1k/3p1np1/p2Pp2p/4P3/1P2B2P/P3NPP1/R2QK2R b KQkq - 0 1", # Invalid turn, kings touching perhaps? No
    "8/2r1bp1k/3p1np1/p2Pp2p/P3P3/1P2B2P/4NPP1/R2QK2R w KQkq - 0 1", # Something
]

for fen in fen_list:
    try:
        print(f"Testing FEN: {fen}")
        valid = stockfish.is_fen_valid(fen)
        print(f"is_fen_valid: {valid}")
        if valid:
            stockfish.set_fen_position(fen)
            # This is where it crashes:
            best_move = stockfish.get_best_move()
            print(f"Best Move: {best_move}")
    except Exception as e:
        print(f"Crashed on FEN {fen}: {e}")
