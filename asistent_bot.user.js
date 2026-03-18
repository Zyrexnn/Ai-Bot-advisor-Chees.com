// ==UserScript==
// @name         Catur Bot (UserScript Version)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Catur Bot FULL AUTO — Fixed rendering, anti-stuck, fast response
// @author       Asisten
// @match        https://www.chess.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    // ==================== CONFIG ====================
    const CONFIG = {
        SERVER_URL: 'http://127.0.0.1:5000',
        POLL_INTERVAL: 400,           // Fallback polling ms
        STABILIZE_DELAY: 150,         // Wait after DOM change before reading
        MOVE_EXEC_DELAY: 30,          // Delay between drag steps (ms)
        POST_MOVE_COOLDOWN: 400,      // Cooldown after executing a move
        WATCHDOG_INTERVAL: 4000,      // Anti-stuck check interval
        WATCHDOG_TIMEOUT: 12000,      // Force reset after this many ms stuck
        REQUEST_TIMEOUT: 10000,       // Server request timeout
        MAX_RETRIES: 3,
        STOCKFISH_DEPTH: 15,          // Default depth (fast play)
        DEBUG: false,                 // Console logging
    };

    // ==================== STATE ====================
    let lastFen = '';
    let isOurTurn = false;
    let currentBestMove = null;
    let autoMode = false; // [FIX] Default to MANUAL mode for safety
    let retryCount = 0;
    let isExecuting = false;
    let isPanelMinimized = false;
    let lastMoveTime = Date.now();
    let ourColor = 'w';
    let pendingRequest = false;   // Debounce flag
    let loopHandle = null;
    let observerActive = false;

    function dbg(...args) {
        if (CONFIG.DEBUG) console.log('[ChessBot]', ...args);
    }

    // ... (UI code remains same)

    // ==================== PREMIUM UI ====================
    const container = document.createElement('div');
    container.style.cssText = `
        position:fixed; bottom:20px; right:20px; z-index:9999999;
        font-family:'Outfit', 'Segoe UI', Arial, sans-serif;
        display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
        background: rgba(26, 26, 46, 0.85);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: white; padding: 16px;
        border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        min-width: 220px; max-width: 240px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex; flex-direction: column; gap: 10px;
        user-select: none;
    `;

    const statusLine = document.createElement('div');
    statusLine.innerText = 'Bot v4.1 Ready';
    statusLine.style.cssText = 'color: #94a3b8; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;';

    const turnLine = document.createElement('div');
    turnLine.innerText = 'Giliran: ?';
    turnLine.style.cssText = 'color: #4ade80; font-size: 12px; font-weight: 600;';

    const moveLine = document.createElement('div');
    moveLine.innerText = '-';
    moveLine.style.cssText = `
        font-size: 28px; font-weight: 800; color: #fff; text-align: center;
        background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 10px;
        margin: 4px 0; text-shadow: 0 0 10px rgba(74, 222, 128, 0.3);
    `;

    const buttonGrid = document.createElement('div');
    buttonGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px;';

    const createBtn = (text, bg, flex = '1') => {
        const b = document.createElement('button');
        b.innerText = text;
        b.style.cssText = `
            flex: ${flex}; background: ${bg}; color: white; border: none;
            padding: 10px 8px; font-size: 13px; font-weight: 700; border-radius: 10px;
            cursor: pointer; transition: all 0.2s;
            display: flex; align-items: center; justify-content: center; gap: 6px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
        b.onmouseover = () => { b.style.filter = 'brightness(1.1)'; b.style.transform = 'translateY(-1px)'; };
        b.onmouseout = () => { b.style.filter = 'brightness(1)'; b.style.transform = 'translateY(0)'; };
        return b;
    };

    const execBtn = createBtn('▶ JALAN', 'linear-gradient(135deg, #ef4444, #b91c1c)');
    execBtn.style.gridColumn = 'span 2';

    const autoToggle = createBtn('MANUAL', '#e67e22'); // Starts orange/manual
    const scanBtn = createBtn('🔄 SCAN', '#3b82f6');
    const clearBtn = createBtn('🧹 HAPUS', '#64748b');
    clearBtn.title = 'Hapus Tanda Panah';

    buttonGrid.appendChild(autoToggle);
    buttonGrid.appendChild(scanBtn);
    buttonGrid.appendChild(clearBtn);
    // Adjust clear button to take full width or re-arrange
    clearBtn.style.gridColumn = 'span 2';

    panel.appendChild(statusLine);
    panel.appendChild(turnLine);
    panel.appendChild(moveLine);
    panel.appendChild(execBtn);
    panel.appendChild(buttonGrid);

    const toggleBtn = document.createElement('div');
    toggleBtn.innerHTML = '🤖';
    toggleBtn.style.cssText = `
        width: 44px; height: 44px; border-radius: 14px; background: #1a1a2e;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; font-size: 22px; border: 2px solid #4ade80;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;
    toggleBtn.onmouseover = () => { toggleBtn.style.transform = 'scale(1.1)'; };
    toggleBtn.onmouseout = () => { toggleBtn.style.transform = 'scale(1)'; };

    container.appendChild(panel);
    container.appendChild(toggleBtn);
    document.body.appendChild(container);

    toggleBtn.onclick = () => {
        isPanelMinimized = !isPanelMinimized;
        panel.style.opacity = isPanelMinimized ? '0' : '1';
        panel.style.transform = isPanelMinimized ? 'translateY(20px) scale(0.95)' : 'translateY(0) scale(1)';
        panel.style.pointerEvents = isPanelMinimized ? 'none' : 'auto';
        setTimeout(() => { panel.style.display = isPanelMinimized ? 'none' : 'flex'; }, 300);
    };

    // ==================== UI HELPERS ====================
    function setStatus(text) { statusLine.innerText = text; }
    function setMove(text) { moveLine.innerText = text; }
    function setBorder(color) { toggleBtn.style.borderColor = color; }

    clearBtn.onclick = () => {
        clearArrow();
        setStatus('Tanda panah dihapus');
    };

    // ==================== VISUAL ARROW HINT ====================
    let arrowSvg = null;

    function clearArrow() {
        if (arrowSvg) {
            arrowSvg.remove();
            arrowSvg = null;
        }
    }

    function drawMoveArrow(moveUCI) {
        clearArrow();
        const board = document.querySelector('chess-board, wc-chess-board');
        if (!board || !moveUCI || moveUCI.length < 4) return;

        const rect = board.getBoundingClientRect();
        const sqW = rect.width / 8;
        const sqH = rect.height / 8;
        const isFlipped = board.classList.contains('flipped');

        const getCoords = (colChar, rowChar) => {
            const col = colChar.charCodeAt(0) - 96;
            const row = parseInt(rowChar);
            return {
                x: sqW * (isFlipped ? 8 - col + 0.5 : col - 0.5),
                y: sqH * (isFlipped ? row - 0.5 : 8 - row + 0.5)
            };
        };

        const start = getCoords(moveUCI[0], moveUCI[1]);
        const end = getCoords(moveUCI[2], moveUCI[3]);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', rect.width);
        svg.setAttribute('height', rect.height);
        svg.style.cssText = `
            position: absolute; top: 0; left: 0; pointer-events: none; z-index: 10;
        `;

        // Arrow marker
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '6');  // Smaller
        marker.setAttribute('markerHeight', '6'); // Proportional
        marker.setAttribute('refX', '5');         // Centered
        marker.setAttribute('refY', '3');
        marker.setAttribute('orient', 'auto');
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 6 3, 0 6'); // Thinner head
        polygon.setAttribute('fill', 'rgba(255, 215, 0, 0.9)');
        marker.appendChild(polygon);
        defs.appendChild(marker);
        svg.appendChild(defs);

        // Line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', start.x);
        line.setAttribute('y1', start.y);
        line.setAttribute('x2', end.x);
        line.setAttribute('y2', end.y);
        line.setAttribute('stroke', 'rgba(255, 215, 0, 0.6)');
        line.setAttribute('stroke-width', (sqW / 10).toString()); // Much thinner!
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('marker-end', 'url(#arrowhead)');
        svg.appendChild(line);

        board.appendChild(svg);
        arrowSvg = svg;
    }

    // ==================== DIALOG HANDLER ====================
    let lastDialogCheck = 0;
    function dismissDialogs() {
        const now = Date.now();
        // Throttle: only check every 1.5s
        if (now - lastDialogCheck < 1500) return;
        lastDialogCheck = now;

        // Only search if there's actually a modal overlay visible
        const overlay = document.querySelector(
            '.modal-container, .board-dialog-component, ' +
            '.modal-game-over-component, [data-cy="modal-container"]'
        );
        if (!overlay) return;

        dbg('Dialog detected, trying to dismiss');

        const confirmBtns = document.querySelectorAll(
            '.board-dialog-confirm, ' +
            'button[data-cy="confirm-btn"], ' +
            '.modal-confirm-button, ' +
            '.ui_v5-button-component'
        );
        confirmBtns.forEach(btn => {
            const text = (btn.innerText || '').toLowerCase();
            if (text.includes('yes') || text.includes('confirm') || text.includes('ok')) {
                btn.click();
            }
        });

        const closeButtons = document.querySelectorAll(
            '.modal-close-icon, .icon-font-chess.x, [data-cy="modal-close"]'
        );
        closeButtons.forEach(btn => btn.click());
    }

    // ==================== GAME STATE DETECTION ====================
    function isGameOver() {
        if (document.querySelector('.game-over-modal, .modal-game-over-component, [data-cy="game-over-modal"]')) return true;
        const headers = document.querySelectorAll('.header-title-component, .game-over-header-component');
        for (const h of headers) {
            const txt = (h.innerText || '').toLowerCase();
            if (/won|draw|stalemate|timeout|resign|checkmate|menang|seri|kalah|aborted/.test(txt)) {
                return true;
            }
        }
        return false;
    }

    function arePiecesAnimating() {
        const board = document.querySelector('chess-board, wc-chess-board');
        // FIX: If board doesn't exist yet, return false (not true!)
        // The caller will handle "no board" separately
        if (!board) return false;

        const pieces = board.querySelectorAll('.piece');
        if (pieces.length < 2) return false;

        for (const p of pieces) {
            const cls = p.getAttribute('class') || '';
            // A piece without a square-XX class is mid-animation
            if (!cls.match(/square-\d\d/)) return true;
        }
        return false;
    }

    // ==================== FEN GENERATION ====================
    function isValidFen(fenStr) {
        if (!fenStr || fenStr.length < 15) return false;
        const parts = fenStr.split(' ');
        if (parts.length < 2) return false;
        const ranks = parts[0].split('/');
        if (ranks.length !== 8) return false;
        let wK = 0, bK = 0;
        for (const rank of ranks) {
            let cnt = 0;
            for (const ch of rank) {
                if (ch >= '1' && ch <= '8') cnt += parseInt(ch);
                else if ('pnbrqkPNBRQK'.includes(ch)) {
                    cnt++;
                    if (ch === 'K') wK++;
                    if (ch === 'k') bK++;
                } else return false;
            }
            if (cnt !== 8) return false;
        }
        return wK === 1 && bK === 1;
    }

    function readBoard() {
        const board = document.querySelector('chess-board, wc-chess-board');
        if (!board) return null;

        const pieces = board.querySelectorAll('.piece');
        if (pieces.length < 2) return null;

        const grid = Array.from({length: 8}, () => Array(8).fill(null));

        pieces.forEach(p => {
            const cls = p.getAttribute('class') || '';
            const sq = cls.match(/square-(\d)(\d)/);
            const tp = cls.match(/(?:^|\s)(w|b)(p|n|b|r|q|k)(?:\s|$)/);
            if (sq && tp) {
                const col = parseInt(sq[1]) - 1;
                const row = 8 - parseInt(sq[2]);
                if (row >= 0 && row < 8 && col >= 0 && col < 8) {
                    grid[row][col] = tp[1] === 'w' ? tp[2].toUpperCase() : tp[2];
                }
            }
        });

        let fen = '';
        for (let r = 0; r < 8; r++) {
            let empty = 0;
            for (let c = 0; c < 8; c++) {
                if (grid[r][c]) {
                    if (empty > 0) { fen += empty; empty = 0; }
                    fen += grid[r][c];
                } else empty++;
            }
            if (empty > 0) fen += empty;
            if (r < 7) fen += '/';
        }

        return { board, fen, grid };
    }

    // ==================== CASTLING DETECTION ====================
    function detectCastlingRights(grid) {
        // Check if kings and rooks are on their starting squares
        let rights = '';

        // White King on e1 (grid[7][4])
        if (grid[7][4] === 'K') {
            if (grid[7][7] === 'R') rights += 'K'; // h1 rook
            if (grid[7][0] === 'R') rights += 'Q'; // a1 rook
        }
        // Black King on e8 (grid[0][4])
        if (grid[0][4] === 'k') {
            if (grid[0][7] === 'r') rights += 'k'; // h8 rook
            if (grid[0][0] === 'r') rights += 'q'; // a8 rook
        }

        return rights || '-';
    }

    // ==================== TURN DETECTION ====================
    function detectTurn(board) {
        // Method 1 (MOST RELIABLE): Move list ply count
        const moveNodes = document.querySelectorAll('wc-move-list .node');
        if (moveNodes.length > 0) {
            const lastNode = moveNodes[moveNodes.length - 1];
            const ply = lastNode.getAttribute('data-ply');
            if (ply) {
                const p = parseInt(ply);
                dbg('Turn from ply:', p, '->', p % 2 !== 0 ? 'b' : 'w');
                return p % 2 !== 0 ? 'b' : 'w';
            }
        }

        // Method 2: Clock activity
        const clocks = document.querySelectorAll('.clock-component, .clock-time-monospace');
        for (const clock of clocks) {
            const parent = clock.closest('.clock-bottom, .clock-top, [class*="clock"]');
            if (parent && parent.classList.contains('clock-player-turn')) {
                if (parent.classList.contains('clock-bottom')) return ourColor;
                else return ourColor === 'w' ? 'b' : 'w';
            }
        }

        // Method 3: Highlights (least reliable, but works for opening)
        const highlights = board.querySelectorAll('.highlight');
        if (highlights.length > 0) {
            const colors = [];
            highlights.forEach(h => {
                const hCls = h.getAttribute('class') || '';
                const sq = hCls.match(/square-(\d)(\d)/);
                if (sq) {
                    const piece = board.querySelector(`.piece.square-${sq[1]}${sq[2]}`);
                    if (piece) {
                        const pCls = piece.getAttribute('class') || '';
                        const m = pCls.match(/(?:^|\s)(w|b)(p|n|b|r|q|k)(?:\s|$)/);
                        if (m) colors.push(m[1]);
                    }
                }
            });

            if (colors.length > 0) {
                const hasW = colors.includes('w');
                const hasB = colors.includes('b');
                // Highlight = last move. If white piece on highlight, white just moved -> black's turn
                if (hasW && !hasB) return 'b';
                if (hasB && !hasW) return 'w';
                // Both colors = capture. Destination piece color made the last move.
                // In a capture, the piece that moved is the one ON the highlighted square.
                // Fall through to default
            }
        }

        // Default: white to move (game start, no move list yet)
        return 'w';
    }

    function getFullState() {
        if (arePiecesAnimating()) {
            dbg('Pieces still animating');
            return null;
        }

        const result = readBoard();
        if (!result) return null;

        const { board, fen, grid } = result;
        const isFlipped = board.classList.contains('flipped');
        ourColor = isFlipped ? 'b' : 'w';

        const turn = detectTurn(board);
        isOurTurn = (turn === ourColor);

        turnLine.innerText = `${ourColor === 'w' ? '⬜' : '⬛'} Kita: ${ourColor === 'w' ? 'Putih' : 'Hitam'} | Giliran: ${turn === 'w' ? 'Putih' : 'Hitam'}`;

        // FIX: Dynamic castling rights instead of always KQkq
        const castling = detectCastlingRights(grid);
        const fullFen = `${fen} ${turn} ${castling} - 0 1`;

        if (!isValidFen(fullFen)) {
            dbg('Invalid FEN:', fullFen);
            return null;
        }

        return { fullFen, board, isFlipped };
    }

    // ==================== MOVE EXECUTION (Promise-based) ====================
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function executeMove(moveUCI) {
        if (isExecuting) return;
        isExecuting = true;

        try {
            moveUCI = moveUCI.trim();
            if (moveUCI.length < 4) {
                setStatus('⚠️ Move invalid');
                return;
            }

            const board = document.querySelector('chess-board, wc-chess-board');
            if (!board) {
                setStatus('❌ Board gone');
                return;
            }

            const c1 = moveUCI.charCodeAt(0) - 96;
            const r1 = parseInt(moveUCI[1]);
            const c2 = moveUCI.charCodeAt(2) - 96;
            const r2 = parseInt(moveUCI[3]);

            const srcSelector = `.piece.square-${c1}${r1}`;
            const pieceEl = board.querySelector(srcSelector);

            if (!pieceEl) {
                setStatus(`⚠️ No piece at ${moveUCI.substring(0, 2)}`);
                lastFen = ''; // Force rescan
                return;
            }

            setStatus(`▶ ${moveUCI}...`);

            const sqW = board.clientWidth / 8;
            const sqH = board.clientHeight / 8;
            const isFlipped = board.classList.contains('flipped');
            const rect = board.getBoundingClientRect();

            const getCoords = (col, row) => {
                // [ANTI-BAN] Add jitter (random 2-6 pixels) to mimic human clicks
                const jitterX = (Math.random() - 0.5) * 6;
                const jitterY = (Math.random() - 0.5) * 6;
                return {
                    x: rect.left + sqW * (isFlipped ? 9 - col - 0.5 : col - 0.5) + jitterX,
                    y: rect.top + sqH * (isFlipped ? row - 0.5 : 9 - row - 0.5) + jitterY
                };
            };

            const src = getCoords(c1, r1);
            const dst = getCoords(c2, r2);

            function fire(el, type, x, y) {
                const opts = {
                    bubbles: true, cancelable: true, clientX: x, clientY: y,
                    pointerId: 1, pointerType: 'mouse', isPrimary: true,
                    buttons: type.includes('up') ? 0 : 1
                };
                el.dispatchEvent(new PointerEvent(type, opts));
                el.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), {
                    bubbles: true, cancelable: true, clientX: x, clientY: y,
                    buttons: type.includes('up') ? 0 : 1
                }));
            }

            // [ANTI-BAN] Randomized human-like delays
            const randomDelay = () => Math.floor(Math.random() * 80) + 40; 

            // Step 1: pointerdown on piece
            fire(pieceEl, 'pointerdown', src.x, src.y);
            await delay(randomDelay());

            // Step 2: pointermove to destination
            fire(document, 'pointermove', dst.x, dst.y);
            await delay(randomDelay());

            // Step 3: pointerup at destination
            const target = document.elementFromPoint(dst.x, dst.y) || board;
            fire(target, 'pointerup', dst.x, dst.y);

            // Step 4: Handle promotion
            if (moveUCI.length === 5) {
                await delay(200);
                handlePromotion(moveUCI[4], isFlipped);
            }

            // Step 5: Dismiss dialogs after move
            await delay(300);
            dismissDialogs();
            await delay(500);
            dismissDialogs();

            setStatus(`✅ ${moveUCI}`);
            setMove('-');
            setBorder('#4CAF50');

            // Cooldown before allowing next action
            await delay(CONFIG.POST_MOVE_COOLDOWN);

            currentBestMove = null;
            lastFen = '';
            retryCount = 0;
            lastMoveTime = Date.now();

            dbg('Move executed successfully:', moveUCI);

        } catch (e) {
            setStatus('❌ ' + e.message);
            dbg('Move execution error:', e);
        } finally {
            // CRITICAL: Always reset isExecuting, even on error
            isExecuting = false;
        }
    }

    function handlePromotion(promoChar, isFlipped) {
        promoChar = promoChar.toLowerCase();
        const color = isFlipped ? 'b' : 'w';
        const selectors = [
            `.promotion-piece.${color}${promoChar}`,
            `.promotion-piece[data-piece="${promoChar}"]`,
            `[data-cy="promotion-${promoChar}"]`
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) { el.click(); return; }
        }
        dbg('Promotion element not found for:', promoChar);
    }

    // ==================== SERVER COMMUNICATION ====================
    function askServer(fen) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${CONFIG.SERVER_URL}/bestmove`,
                data: JSON.stringify({ fen, depth: CONFIG.STOCKFISH_DEPTH }),
                headers: { 'Content-Type': 'application/json' },
                timeout: CONFIG.REQUEST_TIMEOUT,
                onload(res) {
                    try {
                        const d = JSON.parse(res.responseText);
                        if (d.bestmove && d.bestmove.length >= 4) resolve(d.bestmove);
                        else reject(d.error || 'No bestmove');
                    } catch (e) { reject('Parse: ' + e.message); }
                },
                onerror() { reject('Server offline'); },
                ontimeout() { reject('Timeout'); }
            });
        });
    }

    async function requestMove(fen) {
        if (pendingRequest) {
            dbg('Request already pending, skipping');
            return;
        }
        pendingRequest = true;

        setStatus('🧠 Analisa...');
        setMove('Mikir...');
        setBorder('#FFD700');

        try {
            const move = await askServer(fen);

            // Success
            currentBestMove = move;
            setMove(move);
            setStatus('✅ Siap');
            retryCount = 0;
            setBorder('#4CAF50');
            dbg('Best move:', move);

            // [NEW] Draw visual arrow hint
            drawMoveArrow(move);

            if (autoMode) {
                setStatus(`⚡ ${move}`);
                currentBestMove = null;
                await delay(100);
                executeMove(move);
            }
        } catch (err) {
            clearArrow();
            if (retryCount < CONFIG.MAX_RETRIES) {
                retryCount++;
                setStatus(`🔄 Retry ${retryCount}/${CONFIG.MAX_RETRIES}...`);
                dbg('Retry', retryCount, 'reason:', err);
                await delay(1000);
                // Re-check state before retrying
                const state = getFullState();
                if (state && isOurTurn) {
                    pendingRequest = false;
                    requestMove(state.fullFen);
                    return;
                } else {
                    lastFen = '';
                }
            } else {
                setStatus(`❌ ${String(err).substring(0, 30)}`);
                setMove('Error');
                setBorder('#E74C3C');
                dbg('All retries failed:', err);
                await delay(2000);
                lastFen = '';
                retryCount = 0;
            }
        } finally {
            pendingRequest = false;
        }
    }

    // ==================== MAIN LOOP ====================
    function mainLoop() {
        dismissDialogs();

        if (isExecuting || pendingRequest) return;

        // Game over?
        if (isGameOver()) {
            clearArrow();
            setStatus('🏁 Game selesai');
            setMove('GG');
            setBorder('#888');
            currentBestMove = null;
            lastFen = '';
            retryCount = 0;
            return;
        }

        // Read board
        const state = getFullState();
        if (!state) {
            setStatus('⏳ Loading...');
            return;
        }

        if (!isOurTurn) {
            setStatus('💤 Menunggu lawan...');
            setMove('...');
            setBorder('#3498db');
            currentBestMove = null;
            return;
        }

        // Have a move ready? Auto execute
        if (currentBestMove && autoMode) {
            const move = currentBestMove;
            currentBestMove = null;
            executeMove(move);
            return;
        }

        // New position? Analyze
        if (state.fullFen !== lastFen) {
            lastFen = state.fullFen;
            retryCount = 0;

            // Short stabilization: wait, then re-verify
            setTimeout(() => {
                if (arePiecesAnimating()) { lastFen = ''; return; }
                const stable = getFullState();
                if (!stable || !isOurTurn) { lastFen = ''; return; }
                requestMove(stable.fullFen);
            }, CONFIG.STABILIZE_DELAY);
        }
    }

    // ==================== MUTATION OBSERVER ====================
    function setupObserver() {
        const boardContainer = document.querySelector('#board-layout-main, #board-layout-player, .board-layout-component');
        const target = boardContainer || document.body;

        const observer = new MutationObserver((mutations) => {
            // Only react to relevant changes (pieces, highlights, game-over)
            let dominated = false;
            for (const m of mutations) {
                if (m.type === 'childList' || m.type === 'attributes') {
                    const t = m.target;
                    const cls = (t.className || '').toString();
                    if (cls.includes('piece') || cls.includes('highlight') ||
                        cls.includes('clock') || cls.includes('move') ||
                        cls.includes('game-over') || cls.includes('board') ||
                        t.tagName === 'CHESS-BOARD' || t.tagName === 'WC-CHESS-BOARD') {
                        dominated = true;
                        break;
                    }
                }
            }
            if (dominated && !isExecuting && !pendingRequest) {
                dbg('DOM change detected, scheduling loop');
                // Small debounce to batch rapid DOM changes
                clearTimeout(loopHandle);
                loopHandle = setTimeout(mainLoop, 80);
            }
        });

        observer.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });

        observerActive = true;
        dbg('MutationObserver attached to:', target.tagName, target.className);
    }

    // Try to attach observer, retry if board not ready yet
    function trySetupObserver() {
        if (observerActive) return;
        const board = document.querySelector('chess-board, wc-chess-board');
        if (board) {
            setupObserver();
        } else {
            dbg('Board not found yet, retrying observer setup...');
            setTimeout(trySetupObserver, 1000);
        }
    }

    // ==================== WATCHDOG: Anti-stuck ====================
    setInterval(() => {
        if (!isOurTurn || isGameOver()) return;

        if (Date.now() - lastMoveTime > CONFIG.WATCHDOG_TIMEOUT && !isExecuting && !pendingRequest) {
            lastFen = '';
            retryCount = 0;
            currentBestMove = null;
            isExecuting = false; // Force reset in case it got stuck
            setStatus('🔄 Watchdog reset...');
            dbg('Watchdog triggered after', CONFIG.WATCHDOG_TIMEOUT, 'ms');
            setTimeout(mainLoop, 100);
        }
    }, CONFIG.WATCHDOG_INTERVAL);

    // ==================== BUTTON BINDINGS ====================
    execBtn.onclick = () => {
        if (currentBestMove) {
            const m = currentBestMove;
            currentBestMove = null;
            executeMove(m);
        } else {
            lastFen = '';
            retryCount = 0;
            isExecuting = false;
            pendingRequest = false;
            setStatus('🔄 Scanning...');
            setTimeout(mainLoop, 50);
        }
    };

    autoToggle.onclick = () => {
        autoMode = !autoMode;
        autoToggle.innerText = autoMode ? 'AUTO' : 'MANUAL';
        autoToggle.style.background = autoMode ? '#10b981' : '#e67e22'; // Emerald green vs Orange
        autoToggle.title = autoMode ? 'Auto Mode ON' : 'Manual Mode (Safe)';
    };

    scanBtn.onclick = () => {
        lastFen = '';
        retryCount = 0;
        isExecuting = false;
        pendingRequest = false;
        clearArrow();
        setStatus('🔄 Scanning...');
        setTimeout(mainLoop, 50);
    };

    // ==================== START ====================
    setStatus('✅ Bot v4.1 Ready');
    lastMoveTime = Date.now();

    // 1) Fallback polling (adaptive speed)
    setInterval(mainLoop, CONFIG.POLL_INTERVAL);

    // 2) MutationObserver for reactive updates
    trySetupObserver();

    dbg('Bot v4.0 initialized');

})();
