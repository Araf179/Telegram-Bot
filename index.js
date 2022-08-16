require("dotenv").config();
const express = require("express");
var cors = require("cors");
const axios = require("axios");
const bodyParser = require("body-parser");
const Stripe = require("stripe");
var fs = require("fs");
const displayText = require("./constants");
const stripe = Stripe("sk_test_4eC39HqLyjWDarjtT1zdp7dc");

const endpointSecret = "whsec_qBjIamgV7P7fy8JscgSpz2aC3QLGYCQK";
const { TOKEN, SERVER_URL } = process.env;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const URI = `/webhook/${TOKEN}`;
const WEBHOOK_URL = SERVER_URL + URI;
let text = "",
  chatId = "",
  userObjectForTable = {};

const app = express();
const jsonParser = bodyParser.json();

const init = async () => {
  const res = await axios.get(`${TELEGRAM_API}/setWebhook?url=${WEBHOOK_URL}`);
  console.log(res.data);
};

const saveUser = (userObj) => {
  fs.readFile("db.json", function (err, content) {
    if (err) throw err;
    var parseJson = JSON.parse(content);
    parseJson.users.push(userObj);
    fs.writeFile("db.json", JSON.stringify(parseJson), function (err) {
      if (err) throw err;
    });
  });
};

const ifUserExistsUpdateDate = (chatId) => {
  let updatedUser = false; let newData;
  let data = fs.readFileSync("db.json");
  data = JSON.parse(data);
  newData = data;
  data.users.forEach((user, idx) => {
    if(user.chatId === chatId){
      newData.users[idx].date = new Date();
      updatedUser = true;
    }
  });
  fs.writeFileSync("db.json", JSON.stringify(newData));
  if(updatedUser) {
    console.log(updatedUser);
    return true;
  } else {
    console.log(updatedUser)
    return false;
  }
};

const isMoreThan30DaysInFuture = (date) => {
  const then = new Date(date);
  const now = new Date();
  const msBetweenDates = Math.abs(then.getTime() - now.getTime());
  const daysBetweenDates = msBetweenDates / (24 * 60 * 60 * 1000);
  if (daysBetweenDates < 30) {
    console.log("date is within 30 days, dont send message");
    return false;
  } else {
    console.log("date is NOT within 30 days, send message");
    return true;
  }
};

const sendPaymentWarningMessage = async (chatId) => {
  const message = await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text: displayText.sendPaymentMessage,
  });
};

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    let event = request.body;
    if (endpointSecret) {
      const signature = request.headers["stripe-signature"];
      try {
        event = stripe.webhooks.constructEvent(
          request.body,
          signature,
          endpointSecret
        );
      } catch (err) {
        console.log(`⚠️  Webhook signature verification failed.`, err.message);
        return response.sendStatus(400);
      }
    }
    switch (event.type) {
      case "payment_intent.succeeded":
        const paymentIntent = event.data.object;
        if (paymentIntent.status === "succeeded") {
          const message = await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: displayText.paymentMessage,
          });
          if(!ifUserExistsUpdateDate(chatId)){
            userObjectForTable.date = new Date();
            saveUser(userObjectForTable);
          }
        }
        break;
      default:
        // Unexpected event type
        console.log(`Unhandled event type ${event.type}.`);
    }
    response.send();
  }
);

app.get('/', async (req, res) => {
  res.send("Hello world");
})

app.post(URI, jsonParser, async (req, res) => {
  if (
    req.body.message?.chat?.id &&
    req.body.message?.text &&
    req.body.message?.text === "/start"
  ) {
    chatId = req.body.message.chat.id;
    text = displayText.initialMessage;
    const message = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: text,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Pay $65.00 For 30 Day Membership",
              web_app: {
                url: "https://buy.stripe.com/test_14kbKj3Gd0AGeRi7ss",
              },
            },
          ],
        ],
      },
    });
    userObjectForTable.username = message.data.result.chat.first_name;
    userObjectForTable.chatId = message.data.result.chat.id;
  }
  return res.send();
});

app.listen(process.env.PORT || 5050, async () => {
  console.log("🚀 app running on port", process.env.PORT || 5050);
  await init();
  const interval = setInterval(function () {
    fs.readFile("db.json", function (err, content) {
      if (err) throw err;
      var parseJson = JSON.parse(content);
      parseJson.users.forEach((value, index) => {
        if (isMoreThan30DaysInFuture(value.date)) {
          sendPaymentWarningMessage(value.chatId);
        }
      });
    });
  }, 6000000);
});
