# Mobile Recharge API Documentation

This project provides a robust API to fetch mobile recharge plans. It uses a high-performance hybrid architecture that relies on direct API calls for speed, supplemented by headless browser capabilities to generate required authentication tokens, and a resilient fallback mechanism to guarantee 100% uptime.

## Setup

1. Make sure you have Node.js installed (v18+ recommended).
2. Install the necessary dependencies:
```bash
npm install
```

## Running the Server

Start the API server on port 3000:
```bash
node server.js
```

## Architecture

The API operates in two phases:
1. **Primary API (Paisabazaar)**: The server maintains a pre-warmed Puppeteer browser instance that periodically intercepts security tokens (`pb-pass-token`). It uses these tokens to issue direct HTTP `fetch` commands for incredibly fast data retrieval. This system includes a mutex lock to handle heavy concurrent request traffic efficiently.
2. **Fallback API (Plansinfo)**: If the primary API fails (e.g., rate limits or blocked tokens), the server automatically catches the failure and seamlessly reroutes the query. It uses `bmobile.in` to identify the telecom operator and telecom circle, and then parses Next.js JSON blobs from `plansinfo.com` to reconstruct an identical plan payload.

## API Endpoint

### `GET /api/plans`

Fetches mobile recharge plans for a given mobile number.

**Query Parameters:**
* `mobileNo` (String, required) - A valid 10-digit mobile number.

**Examples:**
- Fetching directly using the mobile number:
  ```
  http://localhost:3000/api/plans?mobileNo=9933718668
  ```

### Response Format

The API returns a JSON response containing `success`, the `mobileNo`, the `source` of the data (`paisabazaar` or `plansinfo`), and the `data` which has `operatorDetails` and `plans`. 

All static image resources are automatically rewritten to use the local API server's proxy for bypassing external loading blockages.

```json
{
  "success": true,
  "mobileNo": "9933718668",
  "source": "paisabazaar",
  "data": {
    "operatorDetails": {
      "name": "Airtel",
      "location": "WestBengal & AN Island",
      "imageURL": "http://localhost:3000/media/collections/Airtel.png"
    },
    "plans": {
      "Recommended Packs": [
        {
          "id": 17,
          "amount": 219,
          "planName": "Recommended Packs",
          "data": "3GB",
          "validity": "28 day",
          "talktime": "NA",
          "additionalBenefits": [
            {
              "key": "Adobe Express Premium",
              "value": "12 Months free benefit worth  4k",
              "url": "http://localhost:3000/media/collections/deafault.png"
            }
          ],
          "details": [
            "Calls : Unlimited",
            "Data : 3GB",
            "SMS : 300",
            "Validity : 28 days"
          ]
        }
      ]
    }
  }
}
```

### Static Media Proxy

Images are automatically proxied via the `/media/*` endpoint. When your application requests images using the local URL provided by the API (e.g. `http://localhost:3000/media/collections/deafault.png`), the Express server fetches the image from the original source and securely streams it back to your client.
