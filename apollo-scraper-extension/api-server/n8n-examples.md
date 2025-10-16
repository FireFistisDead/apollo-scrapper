# n8n Workflow Examples

## Example 1: Simple Email Campaign

```json
{
  "name": "Apollo to Email",
  "nodes": [
    {
      "parameters": {
        "url": "http://localhost:3000/api/scrape-apollo",
        "method": "POST",
        "jsonParameters": true,
        "bodyParametersJson": "={\n  \"url\": \"{{ $json.apolloUrl }}\"\n}"
      },
      "name": "Scrape Apollo",
      "type": "n8n-nodes-base.httpRequest",
      "position": [300, 300]
    },
    {
      "parameters": {
        "functionCode": "// Filter contacts with valid emails\nconst data = $input.first().json.data || [];\n\nreturn data\n  .filter(p => p.email && p.email.includes('@'))\n  .map(person => ({\n    json: {\n      ...person,\n      firstName: person.name.split(' ')[0],\n      subject: `Quick question about ${person.company}`,\n      message: `Hi ${person.name.split(' ')[0]},\\n\\nI noticed you're the ${person.job_title} at ${person.company}.\\n\\n[Your pitch here]\\n\\nBest,\\nYour Name`\n    }\n  }));"
      },
      "name": "Process & Filter",
      "type": "n8n-nodes-base.function",
      "position": [500, 300]
    },
    {
      "parameters": {
        "batchSize": 1,
        "options": {
          "reset": false
        }
      },
      "name": "Split Into Batches",
      "type": "n8n-nodes-base.splitInBatches",
      "position": [700, 300]
    },
    {
      "parameters": {
        "amount": 5,
        "unit": "seconds"
      },
      "name": "Wait (Rate Limit)",
      "type": "n8n-nodes-base.wait",
      "position": [900, 300]
    },
    {
      "parameters": {
        "fromEmail": "you@company.com",
        "toEmail": "={{ $json.email }}",
        "subject": "={{ $json.subject }}",
        "text": "={{ $json.message }}"
      },
      "name": "Send Email",
      "type": "n8n-nodes-base.emailSend",
      "position": [1100, 300]
    }
  ]
}
```

## Example 2: Email Verification + Logging

```json
{
  "name": "Apollo → Verify → Email → Log",
  "nodes": [
    {
      "parameters": {
        "url": "http://localhost:3000/api/scrape-apollo",
        "method": "POST",
        "bodyParametersJson": "={\"url\": \"{{ $json.apolloUrl }}\"}"
      },
      "name": "1. Scrape Apollo",
      "type": "n8n-nodes-base.httpRequest"
    },
    {
      "parameters": {
        "batchSize": 1
      },
      "name": "2. Split",
      "type": "n8n-nodes-base.splitInBatches"
    },
    {
      "parameters": {
        "url": "=https://api.hunter.io/v2/email-verifier?email={{ $json.email }}&api_key=YOUR_KEY",
        "method": "GET"
      },
      "name": "3. Verify Email",
      "type": "n8n-nodes-base.httpRequest"
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{ $json.data.status }}",
              "operation": "equals",
              "value2": "valid"
            }
          ]
        }
      },
      "name": "4. If Valid",
      "type": "n8n-nodes-base.if"
    },
    {
      "parameters": {
        "toEmail": "={{ $json.email }}",
        "subject": "Outreach",
        "text": "Hi {{ $json.name }}"
      },
      "name": "5. Send Email",
      "type": "n8n-nodes-base.emailSend"
    },
    {
      "parameters": {
        "operation": "append",
        "sheetId": "YOUR_SHEET_ID",
        "range": "Sheet1!A:E",
        "options": {}
      },
      "name": "6. Log to Sheets",
      "type": "n8n-nodes-base.googleSheets"
    }
  ]
}
```

## Example 3: AI-Powered Personalization

```json
{
  "name": "Apollo → AI Personalization → Email",
  "nodes": [
    {
      "parameters": {
        "url": "http://localhost:3000/api/scrape-apollo",
        "method": "POST"
      },
      "name": "Scrape",
      "type": "n8n-nodes-base.httpRequest"
    },
    {
      "parameters": {
        "batchSize": 1
      },
      "name": "Split",
      "type": "n8n-nodes-base.splitInBatches"
    },
    {
      "parameters": {
        "resource": "text",
        "operation": "create",
        "model": "gpt-3.5-turbo",
        "prompt": "=Write a personalized cold email to {{ $json.name }}, who is {{ $json.job_title }} at {{ $json.company }}. Make it professional, concise, and focused on [YOUR VALUE PROP]."
      },
      "name": "Generate with AI",
      "type": "n8n-nodes-base.openAi"
    },
    {
      "parameters": {
        "toEmail": "={{ $json.email }}",
        "subject": "Quick question",
        "text": "={{ $json.choices[0].message.content }}"
      },
      "name": "Send Email",
      "type": "n8n-nodes-base.emailSend"
    }
  ]
}
```

## Common n8n Patterns

### Pattern 1: Filter Valid Emails
```javascript
// In Function node
const contacts = $input.first().json.data || [];
return contacts
  .filter(p => p.email && p.email.includes('@') && !p.email.includes('noreply'))
  .map(p => ({ json: p }));
```

### Pattern 2: Add Delays (Rate Limiting)
Use "Wait" node between emails:
- Wait: 5 seconds (12 emails/min)
- Wait: 10 seconds (6 emails/min)

### Pattern 3: Personalization Variables
```javascript
// Extract first name
firstName: person.name.split(' ')[0]

// Company domain from email
domain: person.email.split('@')[1]

// Custom greeting based on job title
greeting: person.job_title.includes('CEO') ? 'Dear' : 'Hi'
```

### Pattern 4: Error Handling
```javascript
// Wrap in try-catch
try {
  const result = await sendEmail(person.email);
  return { json: { ...person, sent: true } };
} catch (error) {
  return { json: { ...person, sent: false, error: error.message } };
}
```

## Recommended n8n Workflow

```
1. Schedule Trigger (daily/weekly)
   ↓
2. HTTP Request → Scrape Apollo
   ↓
3. Function → Filter & validate emails
   ↓
4. Split In Batches (1 at a time)
   ↓
5. HTTP Request → Hunter.io verify email
   ↓
6. IF → Check if valid
   ↓
7. OpenAI → Generate personalized message
   ↓
8. Wait → 5 seconds (rate limit)
   ↓
9. Gmail → Send email
   ↓
10. Google Sheets → Log result
```

## Testing Tips

1. **Start Small**: Test with 2-3 contacts first
2. **Use Test Emails**: Send to your own email addresses
3. **Check Spam Scores**: Use mail-tester.com
4. **Monitor Bounces**: Track bounce rates
5. **A/B Test**: Try different subject lines

## Resources

- [n8n Community](https://community.n8n.io)
- [Email Best Practices](https://www.klaviyo.com/blog/email-marketing-best-practices)
- [Hunter.io API](https://hunter.io/api-documentation/v2)
