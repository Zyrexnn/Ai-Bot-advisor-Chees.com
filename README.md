# AI Bot Advisor for Chess.com (v4.1)

A powerful chess assistant for Chess.com that uses the Stockfish engine to provide real-time move suggestions and automatic execution.

![Premium UI](https://res.cloudinary.com/dydv8ux8n/image/upload/v1645450000/chess-bot-ui.png) *Note: Image for illustration*

## 🚀 Features

- **Real-time Analysis**: Uses Stockfish 16+ for top-tier move suggestions.
- **Premium UI**: Sleek, glassmorphism-style interface that integrates seamlessly with Chess.com.
- **Visual Hints**: Draws arrows and highlights the best moves directly on the board.
- **Dual Modes**: 
  - **Manual**: Shows you the best move; you decide when to play.
  - **Auto**: Automatically executes moves with human-like behavior.
- **Anti-Ban Protection**: 
  - Randomized move delays.
  - Click jitter (non-centralized clicks).
  - Variable thinking times.
- **Cross-Platform**: Works on any browser with Tampermonkey support.

## 🛠️ Installation

### 1. Requirements
- [Python 3.10+](https://www.python.org/downloads/)
- [Tampermonkey Extension](https://www.tampermonkey.net/)

### 2. Backend Setup
1. Clone this repository or download the ZIP.
2. Open a terminal in the project folder and install dependencies:
   ```bash
   pip install flask flask-cors stockfish
   ```
3. Download the [Stockfish Engine](https://stockfishchess.org/download/) (v16.1 or later recommended).
4. Place the `stockfish.exe` (or the executable for your OS) in the root directory of this project.
   *Ensure the filename in `main.py` matches your executable (default is `stockfish.exe`).*
5. Run the server:
   ```bash
   python main.py
   ```

### 3. Frontend Setup
1. Open the [Tampermonkey Dashboard](https://www.tampermonkey.net/) in your browser.
2. Click "Create a new script".
3. Copy the entire content of `asistent_bot.user.js` from this repository and paste it into the Tampermonkey editor.
4. Save (Ctrl+S).

## 🎮 How to Use

1. Start the Python server (`main.py`). A small control window will appear.
2. Open [Chess.com](https://www.chess.com) and start a game.
3. You will see a small robot icon 🤖 at the bottom-right of the screen.
4. Click the icon to open the control panel.
5. **Manual Mode**: The bot will suggest moves with arrows and text. Press **"▶ JALAN"** to execute the suggested move.
6. **Auto Mode**: Tap the **"MANUAL/AUTO"** toggle to enable automatic play.

## ⚠️ Disclaimer

**Use this tool for educational purposes only.** Using bots on Chess.com against human players is a violation of their [Terms of Service](https://www.chess.com/legal/user-agreement) and will result in a permanent ban. The authors are not responsible for any accounts banned while using this software.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
