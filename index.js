import express from 'express';
import axios from "axios";
import base64 from "base-64";
import utf8 from "utf8";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors()); 

const shortCode = 4141843;
const passKey = "0311c2b18123c0c83dabb3563b8c4c580dccca8679faff8973b31546e5fe416c";
const baseUrl = "https://api.safaricom.co.ke";
const consumerToken = "dVZJd3Y4RHV5MHdNZU5EOEpFZTFXaVd3bWdDYTNVcjl2UktCMDBWa2hSV1UweTI1Ok1YcnpZVGk4UnBBaThmVnFaN3JtWG9nQmtPOUZEeUpWQ3hzVThMOHdKeldlazZMbkhRcVlCQnY5cHB1TDJBSGo="; 


const generateTimestamp = () => {
    const now = new Date();
    return now.toISOString().replace(/[-:TZ]/g, "").slice(0, 14);
};


const generateBase64EncodedPass = () => {
    const password = `${shortCode}${passKey}${generateTimestamp()}`;
    return base64.encode(utf8.encode(password));
};

const getAccessToken = async () => {
    try {
        const response = await axios.get(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
            headers: { Authorization: `Basic ${consumerToken}` }
        });
        return response.data.access_token;
    } catch (error) {
        console.error("Failed to fetch access token:", error.message);
        throw new Error("Authorization error");
    }
};


app.post('/pay', async (req, res) => {
    const { amount, phoneNumber } = req.body;

    if (!phoneNumber || !amount) {
         return res.status(400).json({ error: "Phone number and amount are required" });
    }

    try {
        console.log("Processing payment request:", { phoneNumber, amount });

        const accessToken = await getAccessToken();

        const requestData = {
            BusinessShortCode: shortCode,
            Password: generateBase64EncodedPass(),
            Timestamp: generateTimestamp(),
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phoneNumber,
            PartyB: shortCode,
            PhoneNumber: phoneNumber,
            CallBackURL: "https://sani-payment-ojrealdevs-projects.vercel.app/api/confirmation",
            AccountReference: "Sani Deliveries",
            TransactionDesc: "Payment on Sani",
        };

        // Make the STK push request
        const response = await axios.post(`${baseUrl}/mpesa/stkpush/v1/processrequest`, requestData, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        console.log("STK Push request sent:", response.data);
        res.status(200).json({ message: "Payment request sent successfully!", response: response.data });
    } catch (error) {
        console.error("Error processing payment request:", error.message);
        console.error("Error  response:", error.response.data);
        // console.error("Payment error:", error);
        res.status(500).json({ error: "Payment processing failed", details: error.message, message: error.response.data.errorMessage });
    }
});

app.post('/mpesa/callback', (req, res) => {
    const callBackData = req.body;

    if(!callBackData.Body.stkCallback) {
        return res.status(400).send("Invalid M-Pesa callback")
    }

    const { MerchantRequestID, CheckoutRequestID, ResultCode, CallbackMetadata } = callbackData.Body.stkCallback;

    if (ResultCode === 0) {
        const amount = CallbackMetadata.Item.find(i => i.Name === "Amount")?.Value;
        const receipt = CallbackMetadata.Item.find(i => i.Name === "MpesaReceiptNumber")?.Value;
        const phone = CallbackMetadata.Item.find(i => i.Name === "PhoneNumber")?.Value;
        const transactionDate = CallbackMetadata.Item.find(i => i.Name === "TransactionDate")?.Value;

        console.log(`Payment received: ${amount} KES from ${phone}, Receipt: ${receipt}`);

        // TODO: Update database (Mark payment as complete)
    } else {
        console.log(`STK Push failed: ${callbackData.Body.stkCallback.ResultDesc}`);
    }

    res.status(200).send("OK");
})

app.listen(port, () => {
    console.log(`Server running on ${port}`);
});
