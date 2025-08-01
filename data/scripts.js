document.getElementById("login-button").addEventListener("click", function() {
    const password = document.getElementById("password").value;
    if (verifyPassword(password)) {
        document.getElementById("login-wrapper").style.display = "none";
        document.getElementById("main-content").style.display = "block";
    } else {
        alert("�p�X���[�h������������܂���");
    }
});


        function showSummary() {
            const summary = document.getElementById('summary-cards');
            if (summary) summary.style.display = 'grid';
        }
        function hideSummary() {
            const summary = document.getElementById('summary-cards');
            if (summary) {
                summary.innerHTML = '';
                summary.style.display = 'none';
            }
        }
    

    // �p�X���[�h�F�؂̗L�������i���ԁj
    const PASSWORD_EXPIRY_HOURS = 8; 

    // �\�[�g�@�\�p�̕ϐ�
    let sortDirection = {};
    let currentTableData = [];

    // �p�X���[�h�F�؊Ǘ��N���X
    class PasswordAuth {
        constructor() {
            this.setupPasswordAuth();
        }

        setupPasswordAuth() {
            // �����̔F�؏�Ԃ��`�F�b�N
            if (this.isPasswordAuthenticated()) {
                this.showAutoLoginScreen();
            } else {
                this.showPasswordScreen();
            }

            // �p�X���[�h�t�H�[���̃C�x���g���X�i�[
            const passwordForm = document.getElementById('password-form');
            if (passwordForm) {
                passwordForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.handlePasswordSubmit();
                });
            }

            // Enter�L�[�Ń��O�C��
            const passwordInput = document.getElementById('password-input');
            if (passwordInput) {
                passwordInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.handlePasswordSubmit();
                    }
                });
            }
        }

        isPasswordAuthenticated() {
            const authData = sessionStorage.getItem('passwordAuth');
            if (!authData) return false;

            try {
                const auth = JSON.parse(authData);
                const now = new Date().getTime();
                const authTime = new Date(auth.timestamp).getTime();
                const hoursElapsed = (now - authTime) / (1000 * 60 * 60);

                return auth.authenticated && hoursElapsed < PASSWORD_EXPIRY_HOURS;
            } catch (error) {
                console.error('�F�؃f�[�^�̉�̓G���[:', error);
                return false;
            }
        }

        handlePasswordSubmit() {
            const passwordInput = document.getElementById('password-input');
            const passwordBtn = document.getElementById('password-btn');
            const passwordError = document.getElementById('password-error');
            const enteredPassword = passwordInput.value;

            // �{�^���𖳌���
            passwordBtn.disabled = true;
            passwordBtn.textContent = '? �F�ؒ�...';

            // �p�X���[�h�`�F�b�N�i�����x�������ăZ�L�����e�B�炵��������j
            setTimeout(() => {
                // �������C��: obfuscated.js ����񋟂���� verifyPassword �֐����Ăяo��
                // verifyPassword �֐������p�\���`�F�b�N
                if (typeof verifyPassword === 'function' && verifyPassword(enteredPassword)) {
                    // �F�ؐ���
                    this.setPasswordAuthentication();
                    passwordError.style.display = 'none';
                    this.showAutoLoginScreen();
                } else {
                    // �F�؎��s
                    passwordError.style.display = 'block';
                    passwordInput.value = '';
                    passwordInput.focus();
                    
                    // �{�^�������ɖ߂�
                    passwordBtn.disabled = false;
                    passwordBtn.textContent = '? ���O�C��';
                    
                    // �G���[���b�Z�[�W�������h�炷
                    passwordError.style.animation = 'shake 0.5s';
                    setTimeout(() => {
                        passwordError.style.animation = '';
                    }, 500);
                }
            }, 1000);
        }

        setPasswordAuthentication() {
            const authData = {
                authenticated: true,
                timestamp: new Date().toISOString()
            };
            sessionStorage.setItem('passwordAuth', JSON.stringify(authData));
            console.log('�p�X���[�h�F�؊���');
        }

        showPasswordScreen() {
            document.getElementById('password-screen').style.display = 'block';
            document.getElementById('auto-login-screen').style.display = 'none';
            document.getElementById('main-app').style.display = 'none';
            
            // �p�X���[�h���͗��Ƀt�H�[�J�X
            setTimeout(() => {
                const passwordInput = document.getElementById('password-input');
                if (passwordInput) {
                    passwordInput.focus();
                }
            }, 100);
        }

        showAutoLoginScreen() {
            document.getElementById('password-screen').style.display = 'none';
            document.getElementById('auto-login-screen').style.display = 'block';
            document.getElementById('main-app').style.display = 'none';
            
            // �������O�C���������J�n
            if (typeof GoogleSheetsAPIAnalyzer !== 'undefined') {
                new GoogleSheetsAPIAnalyzer();
            }
        }

        logout() {
            sessionStorage.removeItem('passwordAuth');
            sessionStorage.removeItem('apiAuthenticated');
            window.location.reload(); // �y�[�W�������[�h���ď�����Ԃɖ߂�
        }
    }

    // CSS animation for shake effect
    const style = document.createElement('style');
    style.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
            20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
    `;
    document.head.appendChild(style);

    // �\�[�g�@�\
    function sortTable(columnIndex) {
        const table = document.getElementById("results-table");
        const tbody = table.querySelector("tbody");
        const rows = Array.from(tbody.querySelectorAll("tr"));
        
        if (rows.length === 0) return;
        
        // �\�[�g����������
        if (sortDirection[columnIndex] === 'asc') {
            sortDirection[columnIndex] = 'desc';
        } else {
            sortDirection[columnIndex] = 'asc';
        }
        
        // �w�b�_�[�̃N���X���X�V
        const headers = table.querySelectorAll("th");
        headers.forEach((header, index) => {
            header.classList.remove('sort-asc', 'sort-desc');
            if (index === columnIndex) {
                header.classList.add(sortDirection[columnIndex] === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
        
        // �\�[�g���s
        rows.sort((a, b) => {
            const aText = a.cells[columnIndex].textContent.trim();
            const bText = b.cells[columnIndex].textContent.trim();
            
            let comparison = 0;
            
            // �񂲂Ƃ̃\�[�g����
            if (columnIndex === 0) {
                // ���t��
                const dateA = new Date(aText);
                const dateB = new Date(bText);
                comparison = dateA - dateB;
            } else if (columnIndex === 5) {
                // ���z�� - ���l�Ƃ��Ĕ�r
                const amountA = parseFloat(aText.replace(/[��,]/g, '')) || 0;
                const amountB = parseFloat(bText.replace(/[��,]/g, '')) || 0;
                comparison = amountA - amountB;
            } else {
                // ���̑��̗� - ������Ƃ��Ĕ�r
                comparison = aText.localeCompare(bText, 'ja');
            }
            
            return sortDirection[columnIndex] === 'asc' ? comparison : -comparison;
        });
        
        // �e�[�u�����X�V
        tbody.innerHTML = '';
        rows.forEach(row => tbody.appendChild(row));
    }

    class GoogleSheetsAPIAnalyzer {
        constructor() {
            console.log('=== GoogleSheetsAPIAnalyzer �������J�n ===');
            
            this.data = []; // �X�v���b�h�V�[�g����ǂݍ��񂾑S�f�[�^
            this.searchResults = []; // �������ʃf�[�^
            this.statusDiv = document.getElementById('status-info');
            this.stores = new Set();
            // �����ɂ��Ȃ���API�L�[��\��t���Ă�������
            this.apiKey = 'AIzaSyAcy7hXztCjngG2poP-Sn_g6ED0TESnNTE'; // ���ۂ�API�L�[�ɒu�������Ă�������
            this.spreadsheetId = '1Z1i7p1s5GeXdfhMoSrcu-JzJL_yima7FNHCoJ7Fz4iY'; // ���ۂ̃X�v���b�h�V�[�gID�ɒu�������Ă�������
            this.sheetName = '�ݎؕ\'; // �V�[�g��
            
            console.log('��{�ݒ芮��');
            console.log('�����F�؊J�n');
            
            // �����F�؂��J�n
            this.initAutoAuth();
            
            console.log('=== �R���X�g���N�^���� ===');
        }

        async initAutoAuth() {
            console.log('=== �����F�؊J�n ===');
            
            // ���O�A�E�g�{�^���̃C�x���g���X�i�[��ݒ�
            this.setupLogoutListener();
            
            // ���Ƀ��O�C���ς݂��`�F�b�N
            const isAuthenticated = sessionStorage.getItem('apiAuthenticated') === 'true';
            console.log('�����F�؏��:', isAuthenticated);
            
            if (isAuthenticated) {
                console.log('����API�F�؍ς� - ���C���A�v����\��');
                await this.showMainApp();
            } else {
                console.log('API�F�؎��s��...');
                await this.performAutoAuth();
            }
            
            console.log('=== �����F�؊��� ===');
        }

        async performAutoAuth() {
            const autoLoginScreen = document.getElementById('auto-login-screen');
            const statusElement = document.getElementById('auto-login-status');
            
            // ���[�h��ʂ�\��
            if (autoLoginScreen) {
                autoLoginScreen.style.display = 'block';
            }

            try {
                // �F�؃X�e�[�^�X�X�V
                statusElement.textContent = 'Google Sheets API �ɐڑ���...';
                
                // �����҂��Ă���F�؊J�n�i���[�U�[�̌�����j
                await this.delay(1000);
                
                // API�L�[�̗L�������e�X�g
                const isValidKey = await this.validateApiKey();
                
                if (isValidKey) {
                    statusElement.textContent = '? API�F�ؐ��� - �V�X�e������������...';
                    await this.delay(500);
                    
                    // �F�ؐ������Z�b�V�����ɕۑ�
                    sessionStorage.setItem('apiAuthenticated', 'true');
                    
                    // ���C���A�v���Ɉڍs
                    await this.showMainApp();
                    
                } else {
                    throw new Error('API�L�[�������܂��͊����؂�ł�');
                }
                
            } catch (error) {
                console.error('�����F�؃G���[:', error);
                statusElement.textContent = `? �F�؎��s: ${error.message}`;
                
                // �G���[���̍Ď��s�{�^����\��
                setTimeout(() => {
                    if (statusElement) {
                        statusElement.innerHTML = `
                            ? �F�؂Ɏ��s���܂���<br>
                            <button onclick="location.reload()" style="margin-top: 15px; padding: 10px 20px; background: #5a7c5a; color: white; border: none; border-radius: 8px; cursor: pointer;">
                                ? �Ď��s
                            </button>
                        `;
                    }
                }, 2000);
            }
        }

        async validateApiKey() {
            try {
                // API�L�[�̗L�������e�X�g�i�ȒP��API�Ăяo���j
                const testUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}?key=${this.apiKey}`;
                const response = await fetch(testUrl);
                
                return response.ok;
            } catch (error) {
                console.error('API�L�[���؃G���[:', error);
                return false;
            }
        }

        setupLogoutListener() {
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    this.handleLogout();
                });
                console.log('���O�A�E�g���X�i�[�ݒ芮��');
            }
        }

        handleLogout() {
            // �p�X���[�h�F�؂�API�F�؂̗������N���A
            sessionStorage.removeItem('apiAuthenticated');
            sessionStorage.removeItem('passwordAuth');
            window.location.reload(); // �y�[�W�������[�h���ď�����Ԃɖ߂�
        }

        async showMainApp() {
            console.log('=== ���C���A�v���\���J�n ===');
            
            const autoLoginScreen = document.getElementById('auto-login-screen');
            const mainApp = document.getElementById('main-app');
            
            console.log('�������O�C����ʗv�f:', autoLoginScreen);
            console.log('���C���A�v���v�f:', mainApp);
            
            if (autoLoginScreen && mainApp) {
                autoLoginScreen.style.display = 'none';
                mainApp.style.display = 'block';
                console.log('��ʐ؂�ւ�����');
                
                // ���C���A�v����������
                try {
                    await this.init();
                    console.log('���C���A�v������������');
                } catch (error) {
                    console.error('���C���A�v���������G���[:', error);
                }
            } else {
                console.error('��ʗv�f��������܂���');
                console.error('�������O�C�����:', autoLoginScreen);
                console.error('���C���A�v��:', mainApp);
            }
            
            console.log('=== ���C���A�v���\������ ===');
        }

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async init() {
            this.log('�V�X�e����������...', 'loading');
            this.setupEventListeners();
            this.setDefaultDates();
            
            // API�L�[���ݒ肳��Ă���ꍇ�͎����ڑ�
            if (this.apiKey && this.apiKey !== 'YOUR_API_KEY_HERE') { // API�L�[����łȂ����Ƃ��`�F�b�N
                await this.connectToGoogleSheets();
            } else {
                this.log('API�L�[��ݒ肵�Ă�������', 'error');
            }
        }

        debugLog(message, data = null) {
            // �f�o�b�O�@�\�͖���������Ă��܂�
            console.log(message, data);
        }

        showDebugInfo() {
            // �f�o�b�O�@�\�͖���������Ă��܂�
        }

        log(message, type = 'info') {
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = `[${timestamp}] ${message}`;
            
            // statusDiv �����݂��邩�m�F
            if (this.statusDiv) {
                if (type === 'loading') {
                    this.statusDiv.className = 'status-loading';
                    this.statusDiv.innerHTML = `<span class="loading-spinner"></span>${logEntry}`;
                } else {
                    this.statusDiv.className = type === 'error' ? 'status-error' : type === 'success' ? 'status-success' : 'status-info';
                    this.statusDiv.textContent = logEntry;
                }
            } else {
                console.warn('Status element not found:', logEntry);
            }
            
            console.log(logEntry);
        }

        async connectToGoogleSheets() {
            if (!this.apiKey || this.apiKey === 'YOUR_API_KEY_HERE') {
                this.log('API�L�[���ݒ肳��Ă��܂���', 'error');
                return;
            }

            this.log('Google Sheets API �ɐڑ���...', 'loading');

            try {
                // �܂��A�X�v���b�h�V�[�g�̏����擾���ăV�[�g�����m�F
                const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}?key=${this.apiKey}`;
                
                // this.debugLog('���^�f�[�^�擾 URL', metadataUrl);
                
                const metadataResponse = await fetch(metadataUrl);
                
                if (!metadataResponse.ok) {
                    throw new Error(`���^�f�[�^�擾���s: ${metadataResponse.status} ${metadataResponse.statusText}`);
                }
                
                const metadata = await metadataResponse.json();
                // this.debugLog('�X�v���b�h�V�[�g���', metadata);
                
                // �u�ݎؕ\�v�V�[�g��T��
                let targetSheetName = this.sheetName;
                const targetSheet = metadata.sheets.find(sheet => sheet.properties.title === this.sheetName);
                
                if (!targetSheet) {
                    throw new Error(`�u${this.sheetName}�v�V�[�g��������܂���B`);
                }
                
                // this.debugLog('�ΏۃV�[�g��������܂���', targetSheetName);
                
                // Google Sheets API v4 ���g�p���ăf�[�^���擾
                const range = `${targetSheetName}!A:I`; // A�񂩂�I��܂ł��擾
                const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}?key=${this.apiKey}`;
                
                // this.debugLog('API ���N�G�X�g URL', url);
                
                const response = await fetch(url);
                
                // this.debugLog('API ���X�|���X', {
                //     status: response.status,
                //     statusText: response.statusText
                // });
                
                if (!response.ok) {
                    if (response.status === 403) {
                        throw new Error('API�L�[�������܂��͌������s�����Ă��܂��BAPI�L�[�ƃX�v���b�h�V�[�g�̋��L�ݒ���m�F���Ă��������B');
                    } else if (response.status === 400) {
                        throw new Error('�X�v���b�h�V�[�gID�܂��̓V�[�g��������������܂���B');
                    } else {
                        throw new Error(`API �G���[: ${response.status} ${response.statusText}`);
                    }
                }
                
                const data = await response.json();
                // this.debugLog('�擾�f�[�^', data);
                
                if (!data.values || data.values.length === 0) {
                    throw new Error('�X�v���b�h�V�[�g�Ƀf�[�^��������܂���B');
                }
                
                this.log('�f�[�^�擾����', 'success');
                await this.processSheetData(data.values);
                this.populateStoreDropdown();
                
                this.log(`�f�[�^�ǂݍ��݊����I${this.data.length}���̃��R�[�h�A${this.stores.size}�X��`, 'success');
                
                document.getElementById('search-section').style.display = 'block';
                
            } catch (error) {
                this.log(`�ڑ��G���[: ${error.message}`, 'error');
                // this.debugLog('�ڑ��G���[�ڍ�', error);
            }
        }

        async processSheetData(values) {
            this.log('�f�[�^����͒�...', 'loading');
            
            if (values.length === 0) {
                throw new Error('�f�[�^����ł�');
            }

            // �w�b�_�[�s���擾
            const headers = values[0];
            // this.debugLog('�w�b�_�[�s', headers);
            
            // �t�B�[���h�}�b�s���O
            const getColumnIndex = (aliases) => {
                for (const alias of aliases) {
                    const index = headers.findIndex(header => {
                        if (header === alias) return true;
                        if (header.toLowerCase().includes(alias.toLowerCase()) || 
                            alias.toLowerCase().includes(header.toLowerCase())) return true;
                        if (alias === 'date' && (header === '�r' || header.includes('���t'))) return true;
                        return false;
                    });
                    if (index !== -1) {
                        // this.debugLog(`�t�B�[���h�}�b�s���O����: ${aliases[0]} -> ${headers[index]} (��${index})`);
                        return index;
                    }
                }
                // this.debugLog(`�t�B�[���h�}�b�s���O���s: ${aliases[0]}`);
                return -1;
            };

            const dateIndex = getColumnIndex(['�r', '���t', 'date', '�����']); // A��
            const nameIndex = getColumnIndex(['���O', 'name', '�����']); // B��
            const lenderIndex = getColumnIndex(['�ݎ�', 'lender']); // C��
            const borrowerIndex = getColumnIndex(['�؎�', 'borrower']); // D��
            const categoryIndex = getColumnIndex(['�J�e�S���[', 'category']); // E��
            const itemIndex = getColumnIndex(['�i��', 'item']); // F��
            const amountIndex = getColumnIndex(['���z', 'amount']); // G��
            const inputDateIndex = getColumnIndex(['���͓���', 'inputDate']); // H��
            const correctionIndex = getColumnIndex(['�C��', 'correction']); // I��

            // this.debugLog('�t�B�[���h�C���f�b�N�X', {
            //     dateIndex, nameIndex, lenderIndex, borrowerIndex, 
            //     categoryIndex, itemIndex, amountIndex, inputDateIndex, correctionIndex
            // });

            // �f�[�^�s�������i�w�b�_�[���X�L�b�v�j
            this.data = values.slice(1).map((row, index) => {
                const getValue = (colIndex) => colIndex !== -1 && row[colIndex] ? row[colIndex] : '';
                
                let extractedDate = '';
                if (dateIndex !== -1 && row[dateIndex]) {
                    extractedDate = this.extractDateFromDateTime(row[dateIndex]);
                } else if (inputDateIndex !== -1 && row[inputDateIndex]) {
                    extractedDate = this.extractDateFromDateTime(row[inputDateIndex]);
                }

                const processedRow = {
                    date: extractedDate,
                    name: getValue(nameIndex),
                    lender: this.normalizeStoreName(getValue(lenderIndex).trim()),
                    borrower: this.normalizeStoreName(getValue(borrowerIndex).trim()),
                    category: getValue(categoryIndex),
                    item: getValue(itemIndex),
                    amount: this.parseAmount(getValue(amountIndex)),
                    originalAmount: getValue(amountIndex),
                    inputDate: getValue(inputDateIndex),
                    correction: getValue(correctionIndex), // �C���t���O��ǉ�
                    originalRowIndex: index + 2 // ? �ǉ�: �X�v���b�h�V�[�g�̎��ۂ̍s�ԍ�
                };

                // �X�ܖ������W
                if (processedRow.lender) this.stores.add(processedRow.lender);
                if (processedRow.borrower) this.stores.add(processedRow.borrower);

                // if (index < 5) {
                //     this.debugLog(`�����ς݃f�[�^�T���v���i�s${index + 2}�j`, processedRow);
                // }

                return processedRow;
            }).filter((row, index) => {
                const isValid = row.date && (row.lender || row.borrower);
                // if (!isValid && index < 10) {
                //     this.debugLog(`�����s���t�B���^�i�s${index + 2}�j`, row);
                // }
                return isValid;
            });

            // this.debugLog(`�ŏI�f�[�^����: ${this.data.length}��`);
            // this.debugLog('���o���ꂽ�X�܈ꗗ', Array.from(this.stores).sort());
        }

        // �X�ܖ��̐��K��
        normalizeStoreName(storeName) {
            if (!storeName) return '';
            
            // �܂���{�I�ȃN���[�j���O
            let normalized = storeName.trim().toUpperCase();
            
            const normalizations = {
                '�N���E�f�B�A�Q': 'Claudia2',
                '�N���E�f�B�A2': 'Claudia2',
                '�}���S': 'MARUGO',
                '�}���S�Z�J���h': 'MARUGO2',
                
                // BISTRO CAVA�n�̐��K����ǉ�
                'BISTRO CAVA,CAVA': 'BISTRO CAVACAVA',
                'BISTRO CAVA CAVA': 'BISTRO CAVACAVA',
                'BISTROCAVACAVA': 'BISTRO CAVACAVA',
                'BISTRO CAVA�ECAVA': 'BISTRO CAVACAVA',
                
                // ���̑��̐��K�����[��
                'MARUGO GRANDE': 'MARUGO GRANDE',
                'MARUGO MARUNOUCHI': 'MARUGO MARUNOUCHI',
                'MARUGO YOTSUYA': 'MARUGO YOTSUYA',
                'MARUGO-D': 'MARUGO-D',
                'MARUGO-OTTO': 'MARUGO-OTTO'
            };
            
            // ���S��v�ł̐��K��
            if (normalizations[normalized]) {
                return normalizations[normalized];
            }
            
            // BISTRO CAVA�n�̕����I���K��
            if (normalized.includes('BISTRO') && normalized.includes('CAVA')) {
                return 'BISTRO CAVACAVA';
            }
            
            return storeName; // ���̌`����ێ�
        }

        extractDateFromDateTime(dateTimeStr) {
            if (!dateTimeStr) return '';
            
            try {
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateTimeStr)) {
                    return dateTimeStr;
                }
                
                const date = new Date(dateTimeStr);
                if (!isNaN(date.getTime())) {
                    return date.toISOString().split('T')[0];
                }
                
                const japaneseMatch = dateTimeStr.match(/(\d{4})�N(\d{1,2})��(\d{1,2})��/);
                if (japaneseMatch) {
                    const [, year, month, day] = japaneseMatch;
                    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }
                
                const slashMatch = dateTimeStr.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
                if (slashMatch) {
                    const [, year, month, day] = slashMatch;
                    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }
                
                const hyphenMatch = dateTimeStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
                if (hyphenMatch) {
                    const [, year, month, day] = hyphenMatch;
                    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }
                
                return '';
            } catch (error) {
                return '';
            }
        }

        parseAmount(amountStr) {
            if (!amountStr) return 0;
            const normalized = amountStr.toString().replace(/[�O-�X]/g, s => String.fromCharCode(s.charCodeAt(0) - 65248));
            const cleaned = normalized.replace(/[,\s]/g, '');
            return parseFloat(cleaned) || 0;
        }

        populateStoreDropdown() {
            const storeSelect = document.getElementById('store-name');
            
            // �����̃I�v�V�������N���A
            while (storeSelect.children.length > 1) {
                storeSelect.removeChild(storeSelect.lastChild);
            }

            // �X�܂��\�[�g���Ēǉ�
            const sortedStores = Array.from(this.stores).sort();
            sortedStores.forEach(store => {
                const option = document.createElement('option');
                option.value = store;
                option.textContent = store;
                storeSelect.appendChild(option);
            });

            // this.debugLog('�X�܃v���_�E���ݒ芮��', sortedStores);
            this.log(`�X�܃v���_�E���ݒ芮��: ${sortedStores.length}�X��`, 'success');
        }

        setupEventListeners() {
            const searchForm = document.getElementById('search-form');
            const exportBtn = document.getElementById('export-btn');
            const allDataBtn = document.getElementById('all-data-btn');
            const correctionSearchBtn = document.getElementById('correction-search-btn');

            searchForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.performSearch();
            });

            allDataBtn.addEventListener('click', () => {
                this.showAllData();
            });

            correctionSearchBtn.addEventListener('click', () => {
                this.searchCorrections();
            });

            exportBtn.addEventListener('click', () => {
                this.exportResults();
            });
        }

        setDefaultDates() {
            const today = new Date();
            const oneMonthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
            
            document.getElementById('start-date').value = oneMonthAgo.toISOString().split('T')[0];
            document.getElementById('end-date').value = today.toISOString().split('T')[0];
        }

        // �C���f�[�^�݂̂���������@�\
        searchCorrections() {
            this.log('�C���f�[�^��������...', 'loading');
            
            try {
                if (!this.data || this.data.length === 0) {
                    this.log('�f�[�^���ɓǂݍ���ł��������B�u? �S�f�[�^��\���v���N���b�N���Ă��������B', 'error');
                    return;
                }

                const startDate = document.getElementById('start-date').value;
                const endDate = document.getElementById('end-date').value;
                const storeName = document.getElementById('store-name').value;
                
                let results = this.data.filter(row => {
                    // �C����Ɂu??�C���v�����邩�`�F�b�N (J��܂���I��ɑ���)
                    const isCorrectionMarked = row.correction && row.correction.includes('??�C��');

                    if (!isCorrectionMarked) return false; // �C���}�[�N���Ȃ��ꍇ�͏��O

                    // ���Ԏw�肪����ꍇ�̍i�荞��
                    if (row.date) {
                        const rowDate = new Date(row.date);
                        const start = startDate ? new Date(startDate) : null;
                        const end = endDate ? new Date(endDate) : null;
                        
                        if (start && rowDate < start) return false;
                        if (end && rowDate > end) return false;
                    }

                    // �X�ܖ��ɂ��i�荞��
                    if (storeName) {
                        // �X�ܖ����w�肳��Ă���ꍇ�A���̓X�܂��ݎ�܂��͎؎�ł���C���f�[�^�̂�
                        return row.lender === storeName || row.borrower === storeName;
                    } else {
                        // �X�ܖ����w�肳��Ă��Ȃ��ꍇ�A�S�Ă̏C���f�[�^��\��
                        return true;
                    }
                });

                this.searchResults = results;
                
                // �\���^�C�g����X�ܖ��ɉ����ĕύX
                const displayTitle = storeName ? `${storeName}�̏C���f�[�^�ڍ�` : '�C���f�[�^�ڍׁi�S�X�܁j';
                
                this.log(`�C���f�[�^��������: ${this.searchResults.length}���̏C�������������܂���`, 'success');
                
                // �X�ܖ����w�肳��Ă��邩�ǂ����Ɋւ�炸�A�T�}���[�͕\�����Ȃ�
                hideSummary(); // <-- �����ŃT�}���[���\���ɂ���֐����Ăяo��
                this.displayAllDataResults(displayTitle); // �ڍ׃e�[�u���̂ݍX�V���邽�߂ɂ��̊֐����g�p
                
                if (results.length === 0) {
                    const message = storeName 
                        ? `${storeName}�̏C���f�[�^���w�肳�ꂽ���ԓ��Ɍ�����܂���ł����B`
                        : '�w�肳�ꂽ���ԓ��ɏC���f�[�^��������܂���ł����B';
                    this.log(message, 'info');
                }
            }
            catch (error) {
                console.error('�C�������G���[:', error);
                this.log('�C���f�[�^�̌������ɃG���[���������܂����B', 'error');
            }
        }

        // �X�ܕʌ����@�\
        performSearch() { 
            const startDate = document.getElementById('start-date').value;
            const endDate = document.getElementById('end-date').value;
            const storeName = document.getElementById('store-name').value;

            if (!startDate || !endDate) {
                this.log('�J�n���ƏI�����𗼕����͂��Ă�������', 'error');
                return;
            }
            
            this.log('�������s��...', 'loading');

            this.searchResults = this.data.filter(row => {
                const dateMatch = row.date >= startDate && row.date <= endDate;
                // �X�ܖ����I������Ă���ꍇ�̂ݓX�܂ōi�荞��
                const storeMatch = storeName ? (row.lender === storeName || row.borrower === storeName) : true; 
                return dateMatch && storeMatch;
            });

            this.log(`��������: ${this.searchResults.length}���̎����������܂���`, 'success');
            this.displayResults(storeName || "�S�X��"); // �X�ܖ����Ȃ��ꍇ�́u�S�X�܁v�ƕ\��
        }

        showAllData() {
            this.log('�S�f�[�^�\����...', 'loading');
            // �^�̑S�f�[�^�\���i���ԃt�B���^���K�p���Ȃ��j
            this.searchResults = [...this.data]; // �S�f�[�^���R�s�[

            this.log(`�S�f�[�^�\��: ${this.searchResults.length}���̎����\����`, 'success');
            this.displayAllDataResults("�S����ڍ�");
        }

        displayResults(storeName) {
            const resultsSection = document.getElementById('results-section');
            resultsSection.style.display = 'block';

            // �w�b�_�[�ƃT�u�^�C�g����X�܌����p�ɐݒ�
            document.getElementById('details-title').textContent = `${storeName}�̎���ڍ�`;
            document.getElementById('details-subtitle-1').textContent = '���ԓ��̎���f�[�^';
            document.getElementById('details-subtitle-2').innerHTML = '&#9654; �e����N���b�N�Ń\�[�g';
            document.getElementById('details-subtitle-3').innerHTML = '&#9654; �e�s���N���b�N�Ńf�[�^�C��';


            showSummary(); // �T�}���[��\������֐����Ăяo��
            this.updateSummaryCards(storeName);
            this.updateDetailsTable(false); // �X�ܕʌ������[�h
            
            // �\�[�g��Ԃ����Z�b�g
            sortDirection = {};
            const headers = document.querySelectorAll("#results-table th");
            headers.forEach(header => {
                header.classList.remove('sort-asc', 'sort-desc');
            });
        }

        displayAllDataResults(titleText = "�S����ڍ�") { // �^�C�g���������Ŏ󂯎��
            const resultsSection = document.getElementById('results-section');
            resultsSection.style.display = 'block';

            // �w�b�_�[�ƃT�u�^�C�g�����X�V
            document.getElementById('details-title').textContent = titleText;
            document.getElementById('details-subtitle-1').textContent = '���ԓ��̎���f�[�^';
            document.getElementById('details-subtitle-2').innerHTML = '&#9654; �e����N���b�N�Ń\�[�g';
            document.getElementById('details-subtitle-3').innerHTML = '&#9654; �e�s���N���b�N�Ńf�[�^�C��';

            hideSummary(); // �T�}���[���\���ɂ���֐����Ăяo��
            this.updateDetailsTable(true); // �S�f�[�^�\�����[�h
            
            // �\�[�g��Ԃ����Z�b�g
            sortDirection = {};
            const headers = document.querySelectorAll("#results-table th");
            headers.forEach(header => {
                header.classList.remove('sort-asc', 'sort-desc');
            });
        }

        updateAllDataSummaryCards() {
            const summaryCards = document.getElementById('summary-cards');
            
            // �J�e�S���[�ʏW�v�p�I�u�W�F�N�g
            const totalByCategory = { '�H��': 0, '����': 0, '���̑�': 0 };
            const countByCategory = { '�H��': 0, '����': 0, '���̑�': 0 };
            const storeTransactions = {};
            
            let totalAmount = 0;
            
            this.searchResults.forEach(row => {
                // �J�e�S���[�̐��K��
                let category = row.category || '���̑�';
                const item = (row.item || '').toLowerCase();
                
                // �i�ڂ�������𔻒�
                if (category.includes('����') || category.includes('�h�����N') || category.includes('��') ||
                    item.includes('��') || item.includes('�r�[��') || item.includes('���C��') || 
                    item.includes('���{��') || item.includes('�Ē�') || item.includes('�E�C�X�L�[') ||
                    item.includes('�J�N�e��') || item.includes('�`���[�n�C') || item.includes('�T���[') ||
                    item.includes('�W���[�X') || item.includes('�R�[�q�[') || item.includes('��') ||
                    item.includes('��') || item.includes('�\�[�_') || item.includes('�R�[��')) {
                    category = '����';
                } 
                // �H�ނ̔���
                else if (category.includes('�H��') || category.includes('�H�i') ||
                    item.includes('��') || item.includes('��') || item.includes('���') ||
                    item.includes('��') || item.includes('�p��') || item.includes('��') ||
                    item.includes('������') || item.includes('��') || item.includes('��') ||
                    item.includes('����') || item.includes('�ݖ�') || item.includes('���X') ||
                    item.includes('����') || item.includes('�X�p�C�X') || item.includes('���h��') ||
                    item.includes('�l�Q') || item.includes('�ʂ˂�') || item.includes('���Ⴊ����') ||
                    item.includes('�A�T��') || item.includes('��') || item.includes('��') || 
                    item.includes('�I���[�u�I�C��')) {
                    category = '�H��';
                } 
                // ���̑�
                else {
                    category = '���̑�';
                }
                
                totalAmount += row.amount;
                totalByCategory[category] = (totalByCategory[category] || 0) + row.amount;
                countByCategory[category] = (countByCategory[category] || 0) + 1;

                // �X�ܕʓ��v
                if (row.lender) {
                    if (!storeTransactions[row.lender]) storeTransactions[row.lender] = { lent: 0, borrowed: 0, count: 0 };
                    storeTransactions[row.lender].lent += row.amount;
                    storeTransactions[row.lender].count++;
                }
                if (row.borrower) {
                    if (!storeTransactions[row.borrower]) storeTransactions[row.borrower] = { lent: 0, borrowed: 0, count: 0 };
                    storeTransactions[row.borrower].borrowed += row.amount;
                    storeTransactions[row.borrower].count++;
                }
            });

            // �ł������ȓX�܁i��������x�[�X�j
            const mostActiveStore = Object.entries(storeTransactions)
                .sort((a, b) => b[1].count - a[1].count)[0];

            // ����\���p�̃w���p�[�֐�
            const createBreakdown = (categoryData, showCounts = false, countData = null) => {
                const categories = ['�H��', '����', '���̑�'];
                return categories
                    .filter(category => (categoryData[category] || 0) !== 0)
                    .map(category => {
                        const amount = categoryData[category] || 0;
                        const countText = showCounts && countData && (countData[category] || 0) > 0
                            ? ` (${countData[category]}��)` 
                            : '';
                        return `<span class="breakdown-item">${category}: ��${amount.toLocaleString()}${countText}</span>`;
                    })
                    .join('<br>');
            };

            summaryCards.innerHTML = `
                <div class="summary-card neutral">
                    <h3>��������z</h3>
                    <div class="value">��${totalAmount.toLocaleString()}</div>
                    <p>${this.searchResults.length}��</p>
                    <div class="breakdown">
                        ${createBreakdown(totalByCategory, true, countByCategory)}
                    </div>
                </div>
                <div class="summary-card positive">
                    <h3>����X�ܐ�</h3>
                    <div class="value">${Object.keys(storeTransactions).length}</div>
                    <p>�X��</p>
                    <div class="breakdown">
                        �ő����: ${mostActiveStore ? mostActiveStore[0] : '�Ȃ�'}<br>
                        ${mostActiveStore ? `(${mostActiveStore[1].count}��)` : ''}
                    </div>
                </div>
                <div class="summary-card neutral">
                    <h3>���ώ���z</h3>
                    <div class="value">��${this.searchResults.length > 0 ? Math.round(totalAmount / this.searchResults.length).toLocaleString() : '0'}</div>
                    <p>1��������</p>
                    <div class="breakdown">
                        ${(() => {
                            const categories = ['�H��', '����', '���̑�'];
                            return categories
                                .filter(category => (countByCategory[category] || 0) > 0)
                                .map(category => {
                                    const avg = Math.round(totalByCategory[category] / countByCategory[category]);
                                    return `<span class="breakdown-item">${category}: ��${avg.toLocaleString()}</span>`;
                                })
                                .join('<br>');
                        })()}
                    </div>
                </div>
                <div class="summary-card negative">
                    <h3>�f�[�^�͈�</h3>
                    <div class="value" style="font-size: 1.2rem;">�S����</div>
                    <div class="value" style="font-size: 1.2rem;">�S�X��</div>
                    <div class="breakdown">
                        ���S�ȃf�[�^�Z�b�g
                    </div>
                </div>
            `;
        }

        updateSummaryCards(storeName) {
            const summaryCards = document.getElementById('summary-cards');
            
            // �J�e�S���[�ʏW�v�p�I�u�W�F�N�g
            const lentByCategory = { '�H��': 0, '����': 0, '���̑�': 0 };
            const borrowedByCategory = { '�H��': 0, '����': 0, '���̑�': 0 };
            const lentCountByCategory = { '�H��': 0, '����': 0, '���̑�': 0 };
            const borrowedCountByCategory = { '�H��': 0, '����': 0, '���̑�': 0 };
            
            let totalLent = 0;
            let totalBorrowed = 0;
            
            this.searchResults.forEach(row => {
                // �J�e�S���[�̐��K��
                let category = row.category || '���̑�';
                const item = (row.item || '').toLowerCase();
                
                // �i�ڂ�������𔻒�
                if (category.includes('����') || category.includes('�h�����N') || category.includes('��') ||
                    item.includes('��') || item.includes('�r�[��') || item.includes('���C��') || 
                    item.includes('���{��') || item.includes('�Ē�') || item.includes('�E�C�X�L�[') ||
                    item.includes('�J�N�e��') || item.includes('�`���[�n�C') || item.includes('�T���[') ||
                    item.includes('�W���[�X') || item.includes('�R�[�q�[') || item.includes('��') ||
                    item.includes('��') || item.includes('�\�[�_') || item.includes('�R�[��')) {
                    category = '����';
                } 
                // �H�ނ̔���
                else if (category.includes('�H��') || category.includes('�H�i') ||
                    item.includes('��') || item.includes('��') || item.includes('���') ||
                    item.includes('��') || item.includes('�p��') || item.includes('��') ||
                    item.includes('������') || item.includes('��') || item.includes('��') ||
                    item.includes('����') || item.includes('�ݖ�') || item.includes('���X') ||
                    item.includes('����') || item.includes('�X�p�C�X') || item.includes('���h��') ||
                    item.includes('�l�Q') || item.includes('�ʂ˂�') || item.includes('���Ⴊ����') ||
                    item.includes('�A�T��') || item.includes('��') || item.includes('��') || 
                    item.includes('�I���[�u�I�C��')) {
                    category = '�H��';
                } 
                // ���̑�
                else {
                    category = '���̑�';
                }
                
                if (row.lender === storeName) {
                    totalLent += row.amount;
                    lentByCategory[category] = (lentByCategory[category] || 0) + row.amount;
                    lentCountByCategory[category] = (lentCountByCategory[category] || 0) + 1;
                } else if (row.borrower === storeName) {
                    totalBorrowed += row.amount;
                    borrowedByCategory[category] = (borrowedByCategory[category] || 0) + row.amount;
                    borrowedCountByCategory[category] = (borrowedCountByCategory[category] || 0) + 1;
                }
            });

            const balance = totalLent - totalBorrowed;
            const balanceByCategory = {
                '�H��': (lentByCategory['�H��'] || 0) - (borrowedByCategory['�H��'] || 0),
                '����': (lentByCategory['����'] || 0) - (borrowedByCategory['����'] || 0),
                '���̑�': (lentByCategory['���̑�'] || 0) - (borrowedByCategory['���̑�'] || 0)
            };

            // ����\���p�̃w���p�[�֐�
            const createBreakdown = (categoryData, showCounts = false, countData = null) => {
                const categories = ['�H��', '����', '���̑�'];
                return categories
                    .filter(category => (categoryData[category] || 0) !== 0)
                    .map(category => {
                        const amount = categoryData[category] || 0;
                        const countText = showCounts && countData && (countData[category] || 0) > 0
                            ? ` (${countData[category]}��)` 
                            : '';
                        return `<span class="breakdown-item">${category}: ��${amount.toLocaleString()}${countText}</span>`;
                    })
                    .join('<br>');
            };

            summaryCards.innerHTML = `
                <div class="summary-card positive">
                    <h3>�ݏo���v</h3>
                    <div class="value">��${totalLent.toLocaleString()}</div>
                    <p>${this.searchResults.filter(row => row.lender === storeName).length}��</p>
                    <div class="breakdown">
                        ${createBreakdown(lentByCategory, true, lentCountByCategory)}
                    </div>
                </div>
                <div class="summary-card negative">
                    <h3>�ؓ����v</h3>
                    <div class="value">��${totalBorrowed.toLocaleString()}</div>
                    <p>${this.searchResults.filter(row => row.borrower === storeName).length}��</p>
                    <div class="breakdown">
                        ${createBreakdown(borrowedByCategory, true, borrowedCountByCategory)}
                    </div>
                </div>
                <div class="summary-card ${balance >= 0 ? 'positive' : 'negative'}">
                    <h3>�c��</h3>
                    <div class="value">��${balance.toLocaleString()}</div>
                    <p> </p>
                    <div class="breakdown">
                        ${createBreakdown(balanceByCategory)}
                    </div>
                </div>
                <div class="summary-card neutral">
                    <h3>�������</h3>
                    <div class="value">${this.searchResults.length}</div>
                    <p>��</p>
                    <div class="breakdown">
                        ${(() => {
                            const totalCountByCategory = {
                                '�H��': (lentCountByCategory['�H��'] || 0) + (borrowedCountByCategory['�H��'] || 0),
                                '����': (lentCountByCategory['����'] || 0) + (borrowedCountByCategory['����'] || 0),
                                '���̑�': (lentCountByCategory['���̑�'] || 0) + (borrowedCountByCategory['���̑�'] || 0)
                            };
                            
                            const categories = ['�H��', '����', '���̑�'];
                            return categories
                                .filter(category => (totalCountByCategory[category] || 0) > 0)
                                .map(category => `<span class="breakdown-item">${category}: ${totalCountByCategory[category]}��</span>`)
                                .join('<br>');
                        })()}
                    </div>
                </div>
            `;
        }

        updateDetailsTable(isAllData = false) {
            const detailsTable = document.getElementById('details-table');
            
            if (this.searchResults.length === 0) {
                detailsTable.innerHTML = '<tr><td colspan="8" class="no-results">���������ɊY������f�[�^������܂���</td></tr>';
                return;
            }

            detailsTable.innerHTML = this.searchResults.map((row, index) => {
                const correctionDisplay = row.correction || ''; 

                if (isAllData) {
                    // �S�f�[�^�\����: �ݎ偨�؎�̌`�ŕ\��
                    return `
                        <tr class="data-row" data-original-row-index="${row.originalRowIndex}" style="cursor: pointer;" title="�N���b�N���ċt����C��">
                            <td>${row.date}</td>
                            <td><span class="type-tag type-�ݎ�">�ݎ�</span></td>
                            <td>${row.lender} �� ${row.borrower}</td>
                            <td>${row.item}</td>
                            <td>${row.category}</td>
                            <td class="amount">��${row.amount.toLocaleString()}</td>
                            <td>${row.name}</td>
                            <td>${correctionDisplay}</td>
                        </tr>
                    `;
                } else {
                    // �X�ܕʌ�����: �]���̕\��
                    const storeName = document.getElementById('store-name').value;
                    const isLender = row.lender === storeName;
                    const transactionType = isLender ? '�ݏo' : '�ؓ�';
                    const counterpart = isLender ? row.borrower : row.lender;
                    const amountClass = isLender ? 'positive' : 'negative';

                    return `
                        <tr class="data-row" data-original-row-index="${row.originalRowIndex}" style="cursor: pointer;" title="�N���b�N���ċt����C��">
                            <td>${row.date}</td>
                            <td><span class="type-tag type-${transactionType}">${transactionType}</span></td>
                            <td>${counterpart}</td>
                            <td>${row.item}</td>
                            <td>${row.category}</td>
                            <td class="amount ${amountClass}">��${row.amount.toLocaleString()}</td>
                            <td>${row.name}</td>
                            <td>${correctionDisplay}</td>
                        </tr>
                    `;
                }
            }).join('');

            // �e�[�u���f�[�^��ۑ��i�\�[�g�p�j
            currentTableData = this.searchResults;
            
            // �s�N���b�N�C�x���g��ǉ�
            this.addRowClickEvents();
        }

        // �s�N���b�N�C�x���g��ǉ��i�C���Łj
        addRowClickEvents() {
            const dataRows = document.querySelectorAll('.data-row');
            
            dataRows.forEach(rowElement => { // �ϐ����� 'row' ���� 'rowElement' �ɕύX
                rowElement.addEventListener('click', (e) => {
                    // �C�x���g�o�u�����O��h�~
                    e.stopPropagation();
                    
                    // data-original-row-index ���璼�ڃX�v���b�h�V�[�g�̍s�ԍ����擾
                    const originalRowIndex = parseInt(rowElement.dataset.originalRowIndex);
                    
                    // this.searchResults ����Ή�����f�[�^������
                    const selectedData = this.searchResults.find(data => data.originalRowIndex === originalRowIndex);

                    if (!selectedData) {
                        console.error('�I�����ꂽ�f�[�^��������܂���', {
                            originalRowIndex: originalRowIndex,
                            searchResultsLength: this.searchResults.length,
                            searchResults: this.searchResults
                        });
                        // alert('�I�����ꂽ�f�[�^��������܂���B�y�[�W���ēǂݍ��݂��čēx���������������B'); // alert �̑���ɃJ�X�^�����[�_�����g�p
                        this.showCustomAlertDialog('�I�����ꂽ�f�[�^��������܂���B�y�[�W���ēǂݍ��݂��čēx���������������B');
                        return;
                    }
                    
                    console.log('�s�N���b�N - �f�[�^�I��:', selectedData);
                    this.showDeleteConfirmDialog(selectedData);
                });
                
                // �z�o�[���ʂ�����
                rowElement.addEventListener('mouseenter', () => {
                    rowElement.style.backgroundColor = 'rgba(214, 158, 46, 0.1)';
                    rowElement.style.transform = 'scale(1.02)';
                    rowElement.style.transition = 'all 0.2s ease';
                    rowElement.style.cursor = 'pointer';
                });
                
                rowElement.addEventListener('mouseleave', () => {
                    rowElement.style.backgroundColor = '';
                    rowElement.style.transform = '';
                });
            });
            
            console.log(`${dataRows.length}�s�ɃN���b�N�C�x���g��ǉ����܂���`);
        }

        // �J�X�^���A���[�g�_�C�A���O�̕\��
        showCustomAlertDialog(message) {
            const dialogId = 'custom-alert-dialog';
            let dialog = document.getElementById(dialogId);

            if (!dialog) {
                dialog = document.createElement('div');
                dialog.id = dialogId;
                dialog.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background-color: white;
                    padding: 20px;
                    border-radius: 10px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    z-index: 10000;
                    text-align: center;
                    max-width: 80%;
                    min-width: 300px;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                `;
                const msgDiv = document.createElement('div');
                msgDiv.id = 'custom-alert-message';
                msgDiv.style.marginBottom = '20px';
                msgDiv.style.fontSize = '16px';
                msgDiv.style.color = '#333';
                dialog.appendChild(msgDiv);

                const closeBtn = document.createElement('button');
                closeBtn.textContent = 'OK';
                closeBtn.style.cssText = `
                    background-color: #5a7c5a;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 600;
                    transition: background-color 0.3s ease;
                `;
                closeBtn.onmouseover = () => closeBtn.style.backgroundColor = '#4a6b4a';
                closeBtn.onmouseout = () => closeBtn.style.backgroundColor = '#5a7c5a';
                closeBtn.onclick = () => dialog.remove();
                dialog.appendChild(closeBtn);

                document.body.appendChild(dialog);
            }

            document.getElementById('custom-alert-message').textContent = message;
            dialog.style.display = 'block';
        }

        // �폜�m�F�_�C�A���O��\���i�C���Łj
        showDeleteConfirmDialog(selectedData) {
            console.log('�m�F�_�C�A���O�\��:', selectedData);
            
            // �f�[�^�̊�{����
            if (!selectedData) {
                console.error('�I�����ꂽ�f�[�^�������ł�');
                this.showCustomAlertDialog('�I�����ꂽ�f�[�^�������ł��B�ēx���������������B');
                return;
            }
            
            const formattedAmount = selectedData.amount ? 
                `��${parseInt(selectedData.amount).toLocaleString('ja-JP')}` : 
                '�s��';
            
            const confirmMessage = `?? �ȉ��̃f�[�^���t����Ƃ��ďC�����M���܂����H

? ���t: ${selectedData.date || '�s��'}
? ���͎�: ${selectedData.name || '�s��'}
? �ݎ�: ${selectedData.lender || '�s��'}
? �؎�: ${selectedData.borrower || '�s��'}
?? �J�e�S���[: ${selectedData.category || '�s��'}
? �i��: ${selectedData.item || '�s��'}
? ���z: ${formattedAmount}
�X�v���b�h�V�[�g�s: ${selectedData.originalRowIndex || '�s��'}

?? ���̑���ɂ��F
�� �ݎ�Ǝ؎傪����ւ�����t����f�[�^���쐬����܂�
�� �����I�Ɂu??�C���v�}�[�N���t�^����܂�
�� �C���p�y�[�W�Ɉړ����܂�

���s���܂����H`;

            // confirm �̑���ɃJ�X�^�����[�_�����g�p
            this.showCustomConfirmDialog(confirmMessage, () => {
                console.log('���[�U�[���m�F - ���_�C���N�g�J�n');
                this.redirectToCorrectionPage(selectedData);
            }, () => {
                console.log('���[�U�[���L�����Z��');
            });
        }

        // �J�X�^���m�F�_�C�A���O�̕\��
        showCustomConfirmDialog(message, onConfirm, onCancel) {
            const dialogId = 'custom-confirm-dialog';
            let dialog = document.getElementById(dialogId);

            if (!dialog) {
                dialog = document.createElement('div');
                dialog.id = dialogId;
                dialog.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background-color: white;
                    padding: 20px;
                    border-radius: 10px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    z-index: 10000;
                    text-align: center;
                    max-width: 80%;
                    min-width: 350px;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    white-space: pre-wrap; /* ���s��L���ɂ��� */
                `;
                const msgDiv = document.createElement('div');
                msgDiv.id = 'custom-confirm-message';
                msgDiv.style.marginBottom = '20px';
                msgDiv.style.fontSize = '16px';
                msgDiv.style.color = '#333';
                dialog.appendChild(msgDiv);

                const btnContainer = document.createElement('div');
                btnContainer.style.display = 'flex';
                btnContainer.style.justifyContent = 'center';
                btnContainer.style.gap = '15px';

                const confirmBtn = document.createElement('button');
                confirmBtn.textContent = '�͂��A���s���܂�';
                confirmBtn.style.cssText = `
                    background-color: #5a7c5a;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 600;
                    transition: background-color 0.3s ease;
                `;
                confirmBtn.onmouseover = () => confirmBtn.style.backgroundColor = '#4a6b4a';
                confirmBtn.onmouseout = () => confirmBtn.style.backgroundColor = '#5a7c5a';
                confirmBtn.onclick = () => { dialog.remove(); onConfirm(); };
                btnContainer.appendChild(confirmBtn);

                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = '�L�����Z��';
                cancelBtn.style.cssText = `
                    background-color: #888;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: 600;
                    transition: background-color 0.3s ease;
                `;
                cancelBtn.onmouseover = () => cancelBtn.style.backgroundColor = '#6a6a6a';
                cancelBtn.onmouseout = () => cancelBtn.style.backgroundColor = '#888';
                cancelBtn.onclick = () => { dialog.remove(); onCancel(); };
                btnContainer.appendChild(cancelBtn);

                dialog.appendChild(btnContainer);
                document.body.appendChild(dialog);
            }

            document.getElementById('custom-confirm-message').textContent = message;
            dialog.style.display = 'block';
        }


        // correction.html�y�[�W�Ƀ��_�C���N�g�i�C���Łj
        redirectToCorrectionPage(selectedData) {
            try {
                console.log('=== ���_�C���N�g�����J�n ===');
                console.log('�I�����ꂽ�f�[�^:', selectedData);
                
                // �f�[�^�̌���
                if (!selectedData) {
                    throw new Error('���M����f�[�^�������ł�');
                }
                
                // �K�v�ȃt�B�[���h�̌���
                const requiredFields = ['date', 'lender', 'borrower', 'category', 'item', 'amount', 'originalRowIndex']; // originalRowIndex ��ǉ�
                const missingFields = requiredFields.filter(field => !selectedData[field]);
                if (missingFields.length > 0) {
                    console.warn('�s�����Ă���t�B�[���h:', missingFields);
                }
                
                // sessionStorage�ɑI�����ꂽ�f�[�^��ۑ�
                const dataToSave = JSON.stringify(selectedData);
                console.log('�ۑ�����f�[�^:', dataToSave);
                
                sessionStorage.setItem('correctionData', dataToSave);
                console.log('sessionStorage�ւ̕ۑ�����');
                
                // �ۑ����ꂽ�f�[�^���m�F
                const savedData = sessionStorage.getItem('correctionData');
                console.log('�ۑ��m�F:', savedData ? '����' : '���s');
                
                if (!savedData) {
                    throw new Error('sessionStorage�ւ̕ۑ��Ɏ��s���܂���');
                }
                
                // URL������i���݂̃y�[�W�̏ꏊ�Ɋ�Â��ēK�؂ȃp�X��ݒ�j
                let correctionUrl;
                const currentPath = window.location.pathname;
                console.log('���݂̃p�X:', currentPath);
                
                if (currentPath.includes('/data/')) {
                    // data/marugo.html ����Ăяo���ꂽ�ꍇ
                    correctionUrl = '../correction.html';
                } else if (currentPath.endsWith('/')) {
                    // ���[�g�f�B���N�g������Ăяo���ꂽ�ꍇ
                    correctionUrl = 'correction.html';
                } else {
                    // ���̑��̏ꍇ
                    correctionUrl = 'correction.html';
                }
                
                console.log('���_�C���N�g��URL:', correctionUrl);
                
                // �o�b�N�A�b�v�Ƃ��āAlocalStorage�ɂ��ۑ�
                try {
                    localStorage.setItem('correctionData', dataToSave);
                    console.log('localStorage�ɂ��o�b�N�A�b�v�ۑ�����');
                } catch (localStorageError) {
                    console.warn('localStorage�ւ̃o�b�N�A�b�v�ۑ��Ɏ��s:', localStorageError);
                }
                
                // correction.html�y�[�W�Ɉړ�
                window.location.href = correctionUrl;
                
            } catch (error) {
                console.error('���_�C���N�g�G���[:', error);
                // alert(`�C���y�[�W�ւ̈ړ����ɃG���[���������܂���: ${error.message}`); // alert �̑���ɃJ�X�^�����[�_�����g�p
                this.showCustomAlertDialog(`�C���y�[�W�ւ̈ړ����ɃG���[���������܂���: ${error.message}`);
                
                // �f�o�b�O�����R���\�[���ɏo��
                console.log('�G���[���̃f�o�b�O���:');
                console.log('- �I�����ꂽ�f�[�^:', selectedData);
                console.log('- ���݂�URL:', window.location.href);
                console.log('- sessionStorage���:', Object.keys(sessionStorage));
                console.log('- localStorage���:', Object.keys(localStorage));
            }
        }

        exportResults() {
            if (this.searchResults.length === 0) {
                // alert('�G�N�X�|�[�g����f�[�^������܂���'); // alert �̑���ɃJ�X�^�����[�_�����g�p
                this.showCustomAlertDialog('�G�N�X�|�[�g����f�[�^������܂���');
                return;
            }

            // CSV�o�͗p�̃}�b�s���O (device��������)
            const csvData = Papa.unparse(this.searchResults.map(row => ({
                ���t: row.date,
                �����: row.name,
                �ݎ�: row.lender,
                �؎�: row.borrower,
                �J�e�S���[: row.category,
                �i��: row.item,
                ���z: row.amount,
                ���͓���: row.inputDate,
                �C��: row.correction || ''
            })));

            const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `��������_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            this.log('CSV�o�͊���', 'success');
        }
    }

    // �A�v���P�[�V����������
    document.addEventListener('DOMContentLoaded', () => {
        // �p�X���[�h�F�؂��ŏ��Ɏ��s
        const passwordAuth = new PasswordAuth();
    });
</script>