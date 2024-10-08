import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fetch from "node-fetch";
import engines from 'consolidate';

const {
    DOMAINS = 'mj-fastlane-test.onrender.com',
    PAYPAL_API_BASE_URL = 'https://api-m.sandbox.paypal.com', // use https://api-m.paypal.com for production environment
    PAYPAL_SDK_BASE_URL = 'https://www.sandbox.paypal.com', // use https://www.paypal.com for production environment
    // PAYPAL_CLIENT_ID = 'AfdS3mz-PHqfz37oieDgxus_imOMo3Yj3Lj1s9jnIwSeb0fZDANp76PXAmxz7I8uJlftt_WrAYgkVHyW',
    // PAYPAL_CLIENT_SECRET = 'EPlBbc-6EE5h8SPadKM49g5fdc0SFXCVUHs9d_YBZol2Mexf6d1DPPWtGdJ761wt95HWlBaSxnhuEW-S',
    PAYPAL_CLIENT_ID = 'AaUGgdWVl2uMf-6q7HgvX9QD5OVYZ0HVaYUZO6gNwtUtnjpts-cZhkSiSiZEY4oEUfUYS3v4VPVNhQtA',
    PAYPAL_CLIENT_SECRET = 'ENTqPHpxQZ-Ryjs67f6vHN6rCKS77TIGRP2gd8WXwpsULv-CJjEdM9o-_5pZ-wslWnNJ4gV0-AHFWEfJ',
    PAYPAL_SELLER_PAYER_ID = 'HKQAR44CHC4LQ',
  } = process.env;

const app = express();

function configureServer(app) {
    app.engine('html', engines.mustache);
    app.set('view engine', 'html');
    app.set('views', './client/views');
  
    app.enable('strict routing');
  
    app.use(cors());
    app.use(express.json());
  
    app.get('/', renderCheckout);
    app.post('/transaction', createOrder);
  
    app.use(express.static('client'));
}

function getPayPalSdkUrl() {
    const sdkUrl = new URL('/sdk/js', PAYPAL_SDK_BASE_URL);
    const sdkParams = new URLSearchParams({
      'client-id': PAYPAL_CLIENT_ID,
      components: 'buttons,fastlane',
    });
    sdkUrl.search = sdkParams.toString();
  
    return sdkUrl.toString();
}

const jwt = getAuthAssertionValue(PAYPAL_CLIENT_ID, PAYPAL_SELLER_PAYER_ID);
console.log("PayPal-Auth-Assertion = ", jwt)

function getAuthAssertionValue(clientId, sellerPayerId) {
    const header = {
        "alg": "none"
    };
    const encodedHeader = base64url(header);
    const payload = {
        "iss": clientId,
        "payer_id": sellerPayerId
    };
    const encodedPayload = base64url(payload);
    return `${encodedHeader}.${encodedPayload}.`;
}

function base64url(json) {
    return btoa(JSON.stringify(json))
        .replace(/=+$/, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

async function getClientToken() {
    try {
      if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        throw new Error('Missing API credentials');
      }
  
      const url = `${PAYPAL_API_BASE_URL}/v1/oauth2/token`;
  
      const headers = new Headers();
      const auth = Buffer.from(
        `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
      ).toString('base64');

      headers.append('Authorization', `Basic ${auth}`);
      headers.append('Content-Type', 'application/x-www-form-urlencoded');
      headers.append('PayPal-Auth-Assertion', jwt);
  
      const searchParams = new URLSearchParams();
      searchParams.append('grant_type', 'client_credentials');
      searchParams.append('response_type', 'client_token');
      searchParams.append('intent', 'sdk_init');
      searchParams.append('domains[]', DOMAINS);
  
      const options = {
        method: 'POST',
        headers,
        body: searchParams,
      };
  
      const response = await fetch(url, options);
      const data = await response.json();
  
      return data.access_token;
    } catch (error) {
      console.error(error);
      return '';
    }
}

async function renderCheckout(req, res) {
    const sdkUrl = getPayPalSdkUrl();
    const clientToken = await getClientToken();
    console.log("sdkUrl = ", sdkUrl);
    console.log("clientToken = ", clientToken);
    const locals = {
      title:
        'Fastlane - PayPal Integration',
      prerequisiteScripts: `
        <script
          src="${sdkUrl}"
          data-sdk-client-token="${clientToken}"
          defer
        ></script>
      `,
      initScriptPath: 'app.js',
      stylesheetPath: './styles.css',
    };
  
    res.render('checkout', locals);
}

async function getAccessToken() {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      throw new Error('Missing API credentials');
    }
  
    const url = `${PAYPAL_API_BASE_URL}/v1/oauth2/token`;
  
    const headers = new Headers();
    const auth = Buffer.from(
      `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
    ).toString('base64');
    headers.append('Authorization', `Basic ${auth}`);
    headers.append('Content-Type', 'application/x-www-form-urlencoded');
  
    const searchParams = new URLSearchParams();
    searchParams.append('grant_type', 'client_credentials');
  
    const options = {
      method: 'POST',
      headers,
      body: searchParams,
    };
  
    const response = await fetch(url, options);
    const data = await response.json();
  
    return data.access_token;
}

export async function createOrder(req, res) {
    try {
      const { paymentToken, shippingAddress } = req.body;
  
      const url = `${PAYPAL_API_BASE_URL}/v2/checkout/orders`;
  
      const headers = new Headers();
      const accessToken = await getAccessToken();
      headers.append('PayPal-Request-Id', Date.now().toString());
      headers.append('Authorization', `Bearer ${accessToken}`);
      headers.append('Content-Type', 'application/json');
      headers.append('PayPal-Auth-Assertion', jwt);
    
      const { fullName } = shippingAddress?.name ?? {};
      const { countryCode, nationalNumber } = shippingAddress?.phoneNumber ?? {};
      const payload = {
        intent: 'CAPTURE',
        payment_source: {
          card: {
            single_use_token: paymentToken.id,
          },
        },
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: '110.00',
            },
            ...(shippingAddress && {
              shipping: {
                type: 'SHIPPING',
                ...(fullName && {
                  name: {
                    full_name: fullName,
                  },
                }),
                address: {
                  address_line_1: shippingAddress.address.addressLine1,
                  address_line_2: shippingAddress.address.addressLine2,
                  admin_area_2: shippingAddress.address.adminArea2,
                  admin_area_1: shippingAddress.address.adminArea1,
                  postal_code: shippingAddress.address.postalCode,
                  country_code: shippingAddress.address.countryCode,
                },
                ...(countryCode && nationalNumber && {
                  phone_number: {
                    country_code: countryCode,
                    national_number: nationalNumber,
                  },
                }),
              },
            }),
          },
        ],
      };
  
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const result = await response.json();
  
      res.status(response.status).json({ result });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
}

configureServer(app);

const port = process.env.PORT ?? 8080;

app.listen(port, () => {
  console.log(`Fastlane Sample Application - Server listening at port ${port}`);
});