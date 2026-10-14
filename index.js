// ============================================
// DARK-MD V2 | WhatsApp Bot
// Single-file starter inspired by anime MD bots
// ============================================

import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";

import pino from "pino";
import fs from "node:fs";
import os from "node:os";
import util from "node:util";

const CONFIG = {
    botName: "DARK-MD",
    ownerName: "Bot Owner",
    ownerNumber: "234XXXXXXXXXX",
    prefix: ".",
    version: "2.0.0"
};

const START_TIME = Date.now();
const logger = pino({ level: "silent" });

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

const formatTime = ms => {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000) % 24;
    const days = Math.floor(ms / 86400000);

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
};

const commands = new Map();

function command(names, description, handler, options = {}) {
    for (const name of names) {
        commands.set(name.toLowerCase(), {
            name: name.toLowerCase(),
            description,
            handler,
            ...options
        });
    }
}

function reply(sock, jid, message, text) {
    return sock.sendMessage(
        jid,
        { text },
        { quoted: message }
    );
}

function getSender(message) {
    return (
        message.key.participant ||
        message.key.remoteJid ||
        ""
    );
}

function isOwner(message) {
    const sender = getSender(message);
    const number = sender.split("@")[0].split(":")[0];

    return number === CONFIG.ownerNumber.replace(/\D/g, "");
}

async function isGroupAdmin(sock, jid, sender) {
    if (!jid.endsWith("@g.us")) return false;

    const metadata = await sock.groupMetadata(jid);

    const member = metadata.participants.find(
        participant =>
            participant.id === sender ||
            participant.phoneNumber === sender
    );

    return Boolean(member?.admin);
}

// ============================================
// GENERAL COMMANDS
// ============================================

command(["menu", "help", "allmenu"], "Show bot commands",
    async ({ sock, jid, message }) => {
        const categories = {
            GENERAL: ["ping", "runtime", "alive", "owner", "info"],
            OWNER: ["restart", "shutdown", "broadcast"],
            GROUP: ["groupinfo", "members", "tagall", "admins"],
            MODERATION: ["kick", "promote", "demote"],
            TOOLS: ["calc", "base64", "reverse", "count"],
            FUN: ["joke", "coinflip", "dice", "quote"],
            GAMES: ["guess", "rps"],
            SYSTEM: ["server", "uptime", "version"]
        };

        let output =
            `╭━━━〔 🔥 ${CONFIG.botName} 〕━━━╮\n` +
            `┃ Version: ${CONFIG.version}\n` +
            `┃ Prefix: ${CONFIG.prefix}\n` +
            `┃ Commands: ${commands.size}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━╯\n`;

        for (const [category, names] of Object.entries(categories)) {
            output += `\n╭━━〔 ${category} 〕━━\n`;

            for (const name of names) {
                const item = commands.get(name);

                if (item) {
                    output +=
                        `┃ ${CONFIG.prefix}${name} — ` +
                        `${item.description}\n`;
                }
            }

            output += "╰━━━━━━━━━━━━━━\n";
        }

        output += "\nMore commands will be added as DARK-MD grows.";

        await reply(sock, jid, message, output);
    }
);

command(["ping"], "Check response speed",
    async ({ sock, jid, message }) => {
        const start = Date.now();

        await reply(
            sock,
            jid,
            message,
            `🏓 Pong!\nResponse: ${Date.now() - start} ms`
        );
    }
);

command(["runtime", "uptime"], "Show uptime",
    async ({ sock, jid, message }) => {
        await reply(
            sock, jid, message,
            `⏱️ Runtime: ${formatTime(Date.now() - START_TIME)}`
        );
    }
);

command(["alive"], "Check whether the bot is online",
    async ({ sock, jid, message }) => {
        await reply(
            sock, jid, message,
            `🔥 ${CONFIG.botName} is online!\n` +
            `Version: ${CONFIG.version}`
        );
    }
);

command(["owner"], "Show owner information",
    async ({ sock, jid, message }) => {
        await reply(
            sock, jid, message,
            `👑 Owner: ${CONFIG.ownerName}\n` +
            `📱 ${CONFIG.ownerNumber}`
        );
    }
);

command(["info", "version"], "Show bot information",
    async ({ sock, jid, message }) => {
        await reply(
            sock, jid, message,
            `${CONFIG.botName}\n` +
            `Version: ${CONFIG.version}\n` +
            `Prefix: ${CONFIG.prefix}\n` +
            `Registered commands: ${commands.size}`
        );
    }
);

// ============================================
// OWNER COMMANDS
// ============================================

command(["restart"], "Request bot restart",
    async ({ sock, jid, message, sender }) => {
        if (!isOwner(message)) {
            return reply(sock, jid, message, "⛔ Owner only.");
        }

        await reply(sock, jid, message, "♻️ Restart requested.");

        // The process manager should restart the application.
        setTimeout(() => process.exit(0), 1000);
    },
    { ownerOnly: true }
);

command(["shutdown"], "Stop the bot",
    async ({ sock, jid, message }) => {
        if (!isOwner(message)) {
            return reply(sock, jid, message, "⛔ Owner only.");
        }

        await reply(sock, jid, message, "🛑 Shutting down.");

        setTimeout(() => process.exit(0), 1000);
    },
    { ownerOnly: true }
);

command(["broadcast"], "Broadcast a message to known chats",
    async ({ sock, jid, message, args }) => {
        if (!isOwner(message)) {
            return reply(sock, jid, message, "⛔ Owner only.");
        }

        const text = args.join(" ");

        if (!text) {
            return reply(
                sock, jid, message,
                "Usage: .broadcast your message"
            );
        }

        // Deliberately restrict broadcasts to the current chat.
        // Add an explicit, owner-controlled recipient list before
        // enabling multi-chat broadcasts.
        await reply(
            sock, jid, message,
            `📢 Broadcast preview:\n\n${text}\n\n` +
            "This preview was not sent to other chats."
        );
    },
    { ownerOnly: true }
);

// ============================================
// GROUP INFORMATION COMMANDS
// ============================================

command(["groupinfo"], "Show current group information",
    async ({ sock, jid, message }) => {
        if (!jid.endsWith("@g.us")) {
            return reply(sock, jid, message, "Group only.");
        }

        const group = await sock.groupMetadata(jid);

        await reply(
            sock, jid, message,
            `📌 ${group.subject}\n` +
            `👥 Members: ${group.participants.length}\n` +
            `🆔 ${jid}`
        );
    }
);

command(["members"], "Count group members",
    async ({ sock, jid, message }) => {
        if (!jid.endsWith("@g.us")) {
            return reply(sock, jid, message, "Group only.");
        }

        const group = await sock.groupMetadata(jid);

        await reply(
            sock, jid, message,
            `👥 Total members: ${group.participants.length}`
        );
    }
);

command(["admins"], "List group administrators",
    async ({ sock, jid, message }) => {
        if (!jid.endsWith("@g.us")) {
            return reply(sock, jid, message, "Group only.");
        }

        const group = await sock.groupMetadata(jid);

        const admins = group.participants
            .filter(member => member.admin)
            .map(member => `• @${member.id.split("@")[0]}`);

        await sock.sendMessage(
            jid,
            {
                text: `👑 Group admins:\n${admins.join("\n") || "None"}`,
                mentions: group.participants
                    .filter(member => member.admin)
                    .map(member => member.id)
            },
            { quoted: message }
        );
    }
);

command(["tagall"], "Mention group members",
    async ({ sock, jid, message, args, sender }) => {
        if (!jid.endsWith("@g.us")) {
            return reply(sock, jid, message, "Group only.");
        }

        if (
            !isOwner(message) &&
            !(await isGroupAdmin(sock, jid, sender))
        ) {
            return reply(
                sock, jid, message,
                "⛔ Only group admins can use this command."
            );
        }

        const group = await sock.groupMetadata(jid);
        const members = group.participants.map(member => member.id);

        const text = args.join(" ") || "Attention everyone!";

        await sock.sendMessage(
            jid,
            {
                text: `${text}\n\n${members.map(id =>
                    `@${id.split("@")[0]}`
                ).join(" ")}`,
                mentions: members
            },
            { quoted: message }
        );
    }
);

// ============================================
// GROUP MODERATION
// ============================================

async function moderateMember({
    sock, jid, message, sender, args, action
}) {
    if (!jid.endsWith("@g.us")) {
        return reply(sock, jid, message, "Group only.");
    }

    if (
        !isOwner(message) &&
        !(await isGroupAdmin(sock, jid, sender))
    ) {
        return reply(
            sock, jid, message,
            "⛔ Only group admins can use this command."
        );
    }

    const quotedParticipant = message.message
        ?.extendedTextMessage
        ?.contextInfo
        ?.participant;

    const mentioned = message.message
        ?.extendedTextMessage
        ?.contextInfo
        ?.mentionedJid || [];

    const target = mentioned[0] || quotedParticipant;

    if (!target) {
        return reply(
            sock, jid, message,
            `Reply to a member or mention them.\n` +
            `Example: .${action} @member`
        );
    }

    try {
        await sock.groupParticipantsUpdate(jid, [target], action);

        await reply(
            sock, jid, message,
            `✅ ${action} action completed for @${target.split("@")[0]}`
        );
    } catch (error) {
        console.error("Moderation error:", error);

        await reply(
            sock, jid, message,
            "❌ Action failed. Check the bot's admin permissions."
        );
    }
}

command(["kick"], "Remove a group member",
    context => moderateMember({ ...context, action: "remove" })
);

command(["promote"], "Promote a group member",
    context => moderateMember({ ...context, action: "promote" })
);

command(["demote"], "Demote a group member",
    context => moderateMember({ ...context, action: "demote" })
);

// ============================================
// TOOL COMMANDS
// ============================================

command(["calc", "calculate"], "Calculate a basic expression",
    async ({ sock, jid, message, args }) => {
        const expression = args.join("");

        // Only allow basic arithmetic characters.
        if (!expression || !/^[\d+\-*/().% ]+$/.test(expression)) {
            return reply(
                sock, jid, message,
                "Usage: .calc (10+5)*2"
            );
        }

        try {
            // Parse arithmetic without eval or Function.
            const tokens = expression.match(
                /\d+(?:\.\d+)?|[()+\-*/%]/g
            );

            if (!tokens || tokens.join("") !== expression.replace(/\s/g, "")) {
                throw new Error("Invalid expression");
            }

            let position = 0;

            function parseExpression() {
                let value = parseTerm();

                while (tokens[position] === "+" ||
                       tokens[position] === "-") {
                    const operator = tokens[position++];
                    const right = parseTerm();

                    value = operator === "+"
                        ? value + right
                        : value - right;
                }

                return value;
            }

            function parseTerm() {
                let value = parseFactor();

                while (["*", "/", "%"].includes(tokens[position])) {
                    const operator = tokens[position++];
                    const right = parseFactor();

                    if (right === 0 && operator !== "*") {
                        throw new Error("Division by zero");
                    }

                    if (operator === "*") value *= right;
                    if (operator === "/") value /= right;
                    if (operator === "%") value %= right;
                }

                return value;
            }

            function parseFactor() {
                if (tokens[position] === "+") {
                    position++;
                    return parseFactor();
                }

                if (tokens[position] === "-") {
                    position++;
                    return -parseFactor();
                }

                if (tokens[position] === "(") {
                    position++;
                    const value = parseExpression();

                    if (tokens[position++] !== ")") {
                        throw new Error("Missing closing parenthesis");
                    }

                    return value;
                }

                const token = tokens[position++];

                if (!token || !/^\d+(?:\.\d+)?$/.test(token)) {
                    throw new Error("Invalid number");
                }

                return Number(token);
            }

            const result = parseExpression();

            if (position !== tokens.length || !Number.isFinite(result)) {
                throw new Error("Invalid expression");
            }

            await reply(sock, jid, message, `🧮 Result: ${result}`);
        } catch {
            await reply(
                sock, jid, message,
                "❌ Invalid calculation. Example: .calc (10+5)*2"
            );
        }
    }
);

command(["reverse"], "Reverse text",
    async ({ sock, jid, message, args }) => {
        await reply(
            sock, jid, message,
            args.join(" ").split("").reverse().join("")
        );
    }
);

command(["count"], "Count characters and words",
    async ({ sock, jid, message, args }) => {
        const text = args.join(" ");

        await reply(
            sock, jid, message,
            `Characters: ${text.length}\n` +
            `Words: ${text.trim() ? text.trim().split(/\s+/).length : 0}`
        );
    }
);

command(["base64"], "Encode text as Base64",
    async ({ sock, jid, message, args }) => {
        await reply(
            sock, jid, message,
            Buffer.from(args.join(" "), "utf8").toString("base64")
        );
    }
);

// ============================================
// FUN COMMANDS
// ============================================

command(["joke"], "Tell a joke",
    async ({ sock, jid, message }) => {
        const jokes = [
            "Why do programmers prefer dark mode? Because light attracts bugs!",
            "Why did the computer get cold? It left its Windows open!",
            "There are 10 kinds of people: those who understand binary and those who don't."
        ];

        await reply(
            sock, jid, message,
            jokes[Math.floor(Math.random() * jokes.length)]
        );
    }
);

command(["coinflip"], "Flip a coin",
    async ({ sock, jid, message }) => {
        await reply(
            sock, jid, message,
            Math.random() < 0.5 ? "🪙 Heads!" : "🪙 Tails!"
        );
    }
);

command(["dice"], "Roll a dice",
    async ({ sock, jid, message }) => {
        await reply(
            sock, jid, message,
            `🎲 You rolled ${Math.floor(Math.random() * 6) + 1}`
        );
    }
);

command(["quote"], "Show a motivational quote",
    async ({ sock, jid, message }) => {
        const quotes = [
            "Great things take time. Keep going.",
            "Discipline beats motivation when motivation fades.",
            "Your future is built by what you do today."
        ];

        await reply(
            sock, jid, message,
            `💬 ${quotes[Math.floor(Math.random() * quotes.length)]}`
        );
    }
);

// ============================================
// GAME COMMANDS
// ============================================

command(["guess"], "Guess a number from 1 to 10",
    async ({ sock, jid, message, args }) => {
        const guess = Number(args[0]);

        if (!Number.isInteger(guess) || guess < 1 || guess > 10) {
            return reply(
                sock, jid, message,
                "Choose a number from 1 to 10. Example: .guess 7"
            );
        }

        const answer = Math.floor(Math.random() * 10) + 1;

        await reply(
            sock, jid, message,
            guess === answer
                ? `🎉 Correct! The number was ${answer}.`
                : `❌ Not quite! The number was ${answer}.`
        );
    }
);

command(["rps"], "Play rock paper scissors",
    async ({ sock, jid, message, args }) => {
        const choices = ["rock", "paper", "scissors"];
        const player = args[0]?.toLowerCase();

        if (!choices.includes(player)) {
            return reply(
                sock, jid, message,
                "Usage: .rps rock, .rps paper, or .rps scissors"
            );
        }

        const bot = choices[Math.floor(Math.random() * 3)];

        let result = "It's a draw!";

        if (
            (player === "rock" && bot === "scissors") ||
            (player === "paper" && bot === "rock") ||
            (player === "scissors" && bot === "paper")
        ) {
            result = "You win! 🎉";
        } else if (player !== bot) {
            result = "I win! 😈";
        }

        await reply(
            sock, jid, message,
            `You: ${player}\nBot: ${bot}\n${result}`
        );
    }
);

// ============================================
// SYSTEM COMMANDS
// ============================================

command(["server"], "Show server information",
    async ({ sock, jid, message }) => {
        await reply(
            sock, jid, message,
            `🖥️ Platform: ${os.platform()}\n` +
            `💾 Free memory: ${(os.freemem() / 1024 ** 3).toFixed(2)} GB\n` +
            `🧠 Total memory: ${(os.totalmem() / 1024 ** 3).toFixed(2)} GB\n` +
            `⏱️ Host uptime: ${formatTime(os.uptime() * 1000)}`
        );
    }
);

// ============================================
// CONNECTION AND MESSAGE HANDLING
// ============================================

let reconnecting = false;

async function startBot() {
    const { state, saveCreds } =
        await useMultiFileAuthState("./session");

    let version;

    try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
    } catch (error) {
        console.error("Could not fetch WhatsApp version:", error.message);
    }

    const sock = makeWASocket({
        auth: state,
        logger,
        version,
        browser: ["DARK-MD", "Chrome", "1.0.0"],
        markOnlineOnConnect: false,
        syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async update => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
            reconnecting = false;
            console.log(`${CONFIG.botName} connected to WhatsApp!`);
        }

        if (connection === "close" && !reconnecting) {
            const status =
                lastDisconnect?.error?.out