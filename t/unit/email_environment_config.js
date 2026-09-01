'use strict';

const expect = require('chai').expect;
const childProcess = require('child_process');

describe('Email environment configuration', () => {
  it('uses the Render URL and validates SMTP settings', () => {
    const script = "const c=require('./lib/config'); console.log(JSON.stringify({domain:c.get('application_domain'),enabled:c.get('send_emails'),sender:c.get('application_sender_email'),smtp:c.get('email_transporter')}));";
    const output = childProcess.execFileSync(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      env: Object.assign({}, process.env, {
        NODE_ENV: 'development',
        RENDER_EXTERNAL_URL: 'https://tttimeoff.onrender.com',
        SEND_EMAILS: 'true',
        APPLICATION_SENDER_EMAIL: 'sender@example.test',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'user',
        SMTP_PASSWORD: 'secret',
      }),
    });
    const result = JSON.parse(output.toString());

    expect(result.domain).to.equal('https://tttimeoff.onrender.com');
    expect(result.enabled).to.equal(true);
    expect(result.sender).to.equal('sender@example.test');
    expect(result.smtp).to.deep.equal({host: 'smtp.example.test', port: 465, secure: true, auth: {user: 'user', pass: 'secret'}});
  });
});
