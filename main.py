import time
import threading
import tkinter as tk
from tkinter import messagebox
from flask import Flask, request, jsonify
from flask_cors import CORS
from stockfish import Stockfish
import logging

# Matikan log bawaan werkzeug agar terminal lebih bersih
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

# ================= KONEKSI STOCKFISH =================
STOCKFISH_PATH = "stockfish.exe"
DEFAULT_DEPTH = 15    # Lebih cepat dari 20
MAX_DEPTH = 25
MOVE_TIME_MS = 2000   # Max waktu analisa per move (ms)
# =====================================================

app = Flask(__name__)
CORS(app)

# Variabel global untuk state aplikasi
stockfish_engine = None
gui_app = None
engine_lock = threading.Lock()
current_depth = DEFAULT_DEPTH

def init_stockfish():
    """Inisialisasi atau re-inisialisasi Stockfish engine."""
    global stockfish_engine
    sf = Stockfish(path=STOCKFISH_PATH)
    sf.set_depth(current_depth)
    sf.update_engine_parameters({"Hash": 256, "Threads": 2})
    stockfish_engine = sf
    return sf

def validate_fen_basic(fen):
    """Validasi FEN dasar sebelum dikirim ke Stockfish."""
    if not fen or len(fen) < 15:
        return False, "FEN terlalu pendek"
    
    parts = fen.split(' ')
    if len(parts) < 2:
        return False, "FEN format salah (kurang bagian)"
    
    board_part = parts[0]
    ranks = board_part.split('/')
    if len(ranks) != 8:
        return False, f"FEN harus 8 baris, dapat {len(ranks)}"
    
    # Cek karakter valid dan hitung raja
    white_kings = 0
    black_kings = 0
    valid_chars = set('pnbrqkPNBRQK12345678')
    
    for i, rank in enumerate(ranks):
        file_count = 0
        for ch in rank:
            if ch not in valid_chars:
                return False, f"Karakter tidak valid '{ch}' di baris {i+1}"
            if ch.isdigit():
                file_count += int(ch)
            else:
                file_count += 1
                if ch == 'K': white_kings += 1
                if ch == 'k': black_kings += 1
        if file_count != 8:
            return False, f"Baris {i+1} total {file_count}, harus 8"
    
    if white_kings != 1:
        return False, f"Raja putih: {white_kings} (harus 1)"
    if black_kings != 1:
        return False, f"Raja hitam: {black_kings} (harus 1)"
    
    # Validasi giliran
    if parts[1] not in ('w', 'b'):
        return False, f"Giliran tidak valid: '{parts[1]}'"
    
    return True, "OK"

@app.route('/bestmove', methods=['POST'])
def get_best_move():
    global stockfish_engine, gui_app, current_depth
    
    if not stockfish_engine:
        return jsonify({"error": "Stockfish belum siap"}), 500
        
    try:
        data = request.json
        fen = data.get('fen')
        req_depth = data.get('depth')
        
        if not fen:
            return jsonify({"error": "FEN wajib diisi"}), 400
        
        # Validasi FEN kita sendiri dulu (lebih cepat dari Stockfish)
        valid, reason = validate_fen_basic(fen)
        if not valid:
            print(f"[API] FEN ditolak: {reason} | FEN: {fen[:40]}")
            return jsonify({"error": f"FEN invalid: {reason}", "fen_received": fen}), 400
            
        # Thread-safe akses ke Stockfish
        with engine_lock:
            try:
                # Apply requested depth if different
                if req_depth and isinstance(req_depth, int) and 1 <= req_depth <= MAX_DEPTH:
                    if req_depth != current_depth:
                        current_depth = req_depth
                        stockfish_engine.set_depth(current_depth)

                if not stockfish_engine.is_fen_valid(fen):
                    print(f"[API] Stockfish tolak FEN: {fen[:50]}")
                    return jsonify({"error": "FEN tidak valid menurut Stockfish", "fen_received": fen}), 400
                    
                stockfish_engine.set_fen_position(fen)
                
                # Use move time limit for faster response
                best_move = stockfish_engine.get_best_move_time(MOVE_TIME_MS)
                
                if not best_move:
                    # Fallback to depth-based if time-based returned None
                    best_move = stockfish_engine.get_best_move()
                
                if not best_move:
                    return jsonify({"error": "Tidak ada langkah (Skakmat/Stalemate)"}), 400
                    
                # Update UI di komputer
                if gui_app:
                    gui_app.root.after(0, gui_app.update_gui_status, f"Saran: {best_move}", "Analisa Selesai")
                    
                print(f"[API] FEN -> Best Move: {best_move} (depth={current_depth})")
                return jsonify({"bestmove": best_move, "depth": current_depth})
                
            except Exception as se:
                print(f"[API Error] Engine crash: {se}")
                # Re-initialize Stockfish otomatis
                try:
                    print("[API] Re-init Stockfish...")
                    init_stockfish()
                    print("[API] Stockfish berhasil di-restart!")
                    if gui_app:
                        gui_app.root.after(0, gui_app.update_gui_status, "Restart OK", "Engine di-restart")
                except Exception as re_err:
                    print(f"[API] FATAL: Gagal restart: {re_err}")
                return jsonify({"error": "Engine crash, sudah di-restart. Coba lagi."}), 500
        
    except Exception as e:
        print(f"Error di /bestmove: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/status', methods=['GET'])
def get_status():
    return jsonify({
        "status": "ready" if stockfish_engine else "starting",
        "depth": current_depth,
        "version": "4.0"
    })

@app.route('/config', methods=['POST'])
def set_config():
    """Endpoint untuk mengubah konfigurasi engine dari UI."""
    global current_depth, MOVE_TIME_MS
    try:
        data = request.json
        if 'depth' in data:
            d = int(data['depth'])
            if 1 <= d <= MAX_DEPTH:
                current_depth = d
                with engine_lock:
                    stockfish_engine.set_depth(current_depth)
        if 'move_time' in data:
            t = int(data['move_time'])
            if 100 <= t <= 30000:
                MOVE_TIME_MS = t
        return jsonify({"depth": current_depth, "move_time": MOVE_TIME_MS})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


class ChessServerApp:
    def __init__(self):
        global gui_app
        gui_app = self
        self.is_running = True
        
        self.root = tk.Tk()
        self.root.title("Bot v4.0 - Server Mode")
        self.root.geometry("300x120")
        self.root.attributes('-topmost', True)
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        
        self.lbl_info = tk.Label(self.root, text="SERVER BERJALAN", font=("Arial", 12, "bold"), fg="green")
        self.lbl_info.pack(pady=5)
        
        self.lbl_status = tk.Label(self.root, text="Menunggu di Port 5000...", font=("Arial", 10))
        self.lbl_status.pack(pady=5)
        
        self.lbl_move = tk.Label(self.root, text="-", font=("Arial", 14, "bold"), fg="blue")
        self.lbl_move.pack(pady=5)
        
        # Mulai Stockfish dan Flask di thread terpisah
        threading.Thread(target=self.start_backend, daemon=True).start()
        
        self.root.mainloop()

    def update_gui_status(self, move_text, status_text):
        self.lbl_move.config(text=move_text)
        self.lbl_status.config(text=status_text)

    def start_backend(self):
        # 1. Inisialisasi Stockfish
        try:
            self.update_gui_status("-", "Memuat Stockfish...")
            init_stockfish()
            self.update_gui_status("-", f"Stockfish Siap (depth={current_depth}). Menunggu browser...")
        except Exception as e:
            self.update_gui_status("ERROR", "Gagal memuat stockfish.exe")
            messagebox.showerror("Error", "Gagal memuat stockfish.exe. Pastikan path benar.\n" + str(e))
            return
            
        # 2. Jalankan Flask Server di Port 5000
        try:
            app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)
        except Exception as e:
            print("Gagal menjalankan API server:", e)

    def on_close(self):
        self.is_running = False
        self.root.destroy()
        import os
        os._exit(0)

if __name__ == "__main__":
    ChessServerApp()
