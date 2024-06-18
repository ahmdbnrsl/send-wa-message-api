const {
    DisconnectReason,
    useMultiFileAuthState,
    MessageType,
    MessageOptions,
    Mimetype
} = require('@whiskeysockets/baileys');

const makeWASocket = require('@whiskeysockets/baileys').default;
const { MongoClient } = require('mongodb');
const express = require('express');
const cors = require('cors');
const useMongoDBAuthState = require('./state.js');
require('dotenv').config();

const mongoURL = process.env.MONGODB_URI;
const port = process.env.PORT || 8080;
const mySecret = process.env.MY_SECRET;
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const mongoClient = new MongoClient(mongoURL);

(async () => {
    await mongoClient.connect();
})();

let sock;

async function connectionLogic() {
    await mongoClient.connect();
    const collection = mongoClient.db('wa-send-message').collection('api');
    const { state, saveCreds } = await useMongoDBAuthState(collection);
    sock = makeWASocket({
        printQRInTerminal: true,
        auth: state
    });
    sock.ev.on('connection.update', async update => {
        const { connection, lastDisconnect, qr } = update || {};

        if (qr) {
            console.log(qr);
        }

        if (connection === 'close') {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !==
                DisconnectReason.loggedOut;

            if (shouldReconnect) {
                connectionLogic();
            }
        }
    });
    sock.ev.on('creds.update', saveCreds);
}

app.get('/', (req, res) => {
    res.json({
        status: true,
        author: 'Ahmad Beni Rusli'
    });
});

app.post('/send', async (req, res) => {
    const num = req.body.number;
    const number = num?.startsWith('0')
        ? num?.replace(/\D/g, '').replace('0', '62')
        : num?.replace(/\D/g, '');
    const mess = req.body.mess;
    const rep = req.body.rep;
    const secret = req.body.secret;
    if (secret !== mySecret) {
        return res.status(401).json({ status: 401, message: 'unauthorized!' });
    }
    try {
        const q = {
            key: {
                fromMe: false,
                participant: number + '@s.whatsapp.net'
            },
            message: {
                extendedTextMessage: {
                    text: mess
                }
            }
        };
        if (number) {
            const isConnected = () => (sock?.user ? true : false);
            if (isConnected()) {
                res.end();
                sock.sendMessage('6288216018165@s.whatsapp.net', {
                    text: `Pengirim : wa.me/${number}\n\nPesan : ${mess}`
                });
                await sock.sendMessage(
                    number + '@s.whatsapp.net',
                    {
                        text: rep
                    },
                    { quoted: q }
                );
            }
        }
    } catch (e) {
        res.status(500).json(e);
    } finally {
        await mongoClient.close();
    }
});

app.use('/', (req, res) => {
    res.status(404).json({ status: 404, message: 'not found!' });
});

app.listen(port, '0.0.0.0', () => {
    console.log('legacy server listening!');
});

connectionLogic();
