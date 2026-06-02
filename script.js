class HanoiTowers {
    constructor() {
        this.rods = [[], [], []];
        this.numDisks = 5;
        this.moves = 0;
        this.startTime = null;
        this.timerInterval = null;
        this.selectedRod = null;
        this.gameActive = false;
        
        this.player = JSON.parse(localStorage.getItem('tg_user')) || null;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupTelegramCallback();
        this.checkAuth();
        this.loadStatistics();
    }

    bindEvents() {
        document.getElementById('newGameBtn').addEventListener('click', () => this.newGame());
        document.getElementById('difficulty').addEventListener('change', (e) => {
            this.numDisks = parseInt(e.target.value);
            this.updateMinMoves();
            this.newGame();
        });
        document.getElementById('refreshStats').addEventListener('click', () => this.loadStatistics());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
    }

    setupTelegramCallback() {
        window.onTelegramAuth = async (user) => {
            try {
                const authRes = await fetch('http://localhost:1646/api/auth/telegram', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(user)
                });

                const data = await authRes.json();
                
                if (data.success) {
                    this.player = data.player;
                    localStorage.setItem('tg_user', JSON.stringify(this.player));
                    this.checkAuth();
                    this.loadStatistics();
                } else {
                    alert('Ошибка авторизации на сервере: ' + (data.error || 'Неизвестная ошибка'));
                }
            } catch (error) {
                console.error('Ошибка при отправке данных авторизации:', error);
                alert('Не удалось связаться с локальным сервером бэкенда!');
            }
        };
    }

    checkAuth() {
        if (this.player) {
            document.getElementById('authSection').style.display = 'none';
            document.getElementById('gameInterface').style.display = 'block';
            
            const profileDiv = document.getElementById('userProfile');
            let profileHtml = `Привет, ${this.player.first_name}!`;
            if (this.player.username) {
                profileHtml += ` (@${this.player.username})`;
            }
            profileDiv.innerHTML = profileHtml;
            
            this.updateMinMoves();
            this.newGame();
        } else {
            document.getElementById('authSection').style.display = 'block';
            document.getElementById('gameInterface').style.display = 'none';
        }
    }

    logout() {
        localStorage.removeItem('tg_user');
        this.player = null;
        this.gameActive = false;
        clearInterval(this.timerInterval);
        this.checkAuth();
    }

    updateMinMoves() {
        const minMoves = Math.pow(2, this.numDisks) - 1;
        document.getElementById('minMoves').textContent = minMoves;
    }

    newGame() {
        this.rods = [[], [], []];
        for (let i = this.numDisks; i >= 1; i--) {
            this.rods[0].push(i);
        }
        
        this.moves = 0;
        document.getElementById('movesCount').textContent = this.moves;
        
        this.selectedRod = null;
        this.gameActive = true;
        document.getElementById('message').textContent = '';
        
        this.resetTimer();
        this.startTimer();
        this.render();
    }

    startTimer() {
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsedTime = Date.now() - this.startTime;
            const totalSeconds = Math.floor(elapsedTime / 1000);
            const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
            const seconds = (totalSeconds % 60).toString().padStart(2, '0');
            document.getElementById('timeDisplay').textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    resetTimer() {
        clearInterval(this.timerInterval);
        document.getElementById('timeDisplay').textContent = '00:00';
    }

    handleRodClick(rodIndex) {
        if (!this.gameActive) return;

        if (this.selectedRod === null) {
            if (this.rods[rodIndex].length > 0) {
                this.selectedRod = rodIndex;
            }
        } else {
            if (this.selectedRod === rodIndex) {
                this.selectedRod = null;
            } else {
                this.moveDisk(this.selectedRod, rodIndex);
                this.selectedRod = null;
            }
        }
        this.render();
    }

    moveDisk(fromRod, toRod) {
        const fromDisks = this.rods[fromRod];
        const toDisks = this.rods[toRod];

        if (fromDisks.length === 0) return;

        const diskToMove = fromDisks[fromDisks.length - 1];
        const topDiskOnToRod = toDisks[toDisks.length - 1];

        if (topDiskOnToRod !== undefined && diskToMove > topDiskOnToRod) {
            document.getElementById('message').textContent = 'Нельзя класть больший диск на меньший!';
            document.getElementById('message').className = 'message error';
            return;
        }
        
        fromDisks.pop();
        toDisks.push(diskToMove);
        
        this.moves++;
        document.getElementById('movesCount').textContent = this.moves;
        document.getElementById('message').textContent = '';

        this.checkWin();
    }

    async checkWin() {
        if (this.rods[1].length === this.numDisks || this.rods[2].length === this.numDisks) {
            this.gameActive = false;
            clearInterval(this.timerInterval);
            
            const timeStr = document.getElementById('timeDisplay').textContent;
            document.getElementById('message').textContent = `Поздравляем! Вы прошли игру за ${this.moves} ходов! Время: ${timeStr}`;
            document.getElementById('message').className = 'message success';

            if (this.player && this.player.tg_id) { 
                const gameData = {
                    playerId: this.player.tg_id, 
                    completionTime: timeStr,
                movesCount: this.moves,
                    difficulty: this.numDisks
                };

                try {
                    const res = await fetch('http://localhost:1646/api/games', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(gameData)
                    });
                    const data = await res.json();
                    if (data.success) {
                        this.loadStatistics(); 
                    }
                } catch (err) {
                    console.error('Ошибка сохранения игры на сервере:', err);
                }
            }
        }
    }

    async loadStatistics() {
        try {
            const res = await fetch(`http://localhost:1646/api/games?limit=20&t=${Date.now()}`);
            const games = await res.json();

            const container = document.getElementById('statsContainer');
            if (games.length === 0) {
                container.innerHTML = '<p>Результатов пока нет.</p>';
                return;
            }

            let html = `
                <table>
                    <thead>
                        <tr>
                            <th>Игрок</th>
                            <th>Дисков</th>
                            <th>Ходов</th>
                            <th>Время</th>
                            <th>Дата</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            games.forEach(game => {
                const gameDate = new Date(game.game_date).toLocaleString('ru-RU');
                html += `
                    <tr>
                        <td>${game.player_name}</td>
                        <td>${game.difficulty}</td>
                        <td>${game.moves_count}</td>
                        <td>${game.completion_time}</td>
                        <td>${gameDate}</td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
            container.innerHTML = html;
        } catch (err) {
            console.error('Ошибка при загрузке статистики:', err);
            document.getElementById('statsContainer').innerHTML = '<p style="color: red;">Не удалось загрузить статистику. Проверьте запуск бэкенда.</p>';
        }
    }

    render() {
        const gameBoard = document.getElementById('gameBoard');
        gameBoard.innerHTML = '';
        const rodLabels = ['A', 'B', 'C'];
        
        for (let i = 0; i < 3; i++) {
            const rod = document.createElement('div');
            rod.className = 'rod';
            rod.innerHTML = `
                <div class=\"rod-pole\"></div>
                <div class=\"rod-base\"></div>
                <div class=\"discs-container\" id=\"rod-${i}\"></div>
                <div class=\"rod-label\">Стержень ${rodLabels[i]}</div>
            `;
            
            rod.addEventListener('click', () => this.handleRodClick(i));
            gameBoard.appendChild(rod);
            
            const container = document.getElementById(`rod-${i}`);
            
            for (let j = this.rods[i].length - 1; j >= 0; j--) {
                const diskSize = this.rods[i][j];
                const disk = document.createElement('div');
                disk.className = 'disc';
                
                if (this.selectedRod === i && j === this.rods[i].length - 1) {
                    disk.classList.add('selected');
                }
                
                const width = 50 + diskSize * 20;
                disk.style.width = width + 'px';
                container.appendChild(disk);
            }
        }
    }
}
document.addEventListener('DOMContentLoaded', () => {
    new HanoiTowers();
});
