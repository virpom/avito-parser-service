import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('VNC')
@Controller('browser/vnc')
export class VncController {
  @Get()
  async getVncClient(@Res() reply: FastifyReply) {
    // Возвращаем noVNC клиент
    const vncHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Avito Browser</title>
    <meta charset="utf-8">
    <style>
        body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: #000;
        }
        #screen {
            width: 100vw;
            height: 100vh;
        }
    </style>
</head>
<body>
    <div id="screen"></div>
    <script type="module">
        import RFB from '/novnc/core/rfb.js';
        
        const rfb = new RFB(document.getElementById('screen'), 'ws://localhost:6080/websockify');
        rfb.scaleViewport = true;
        rfb.resizeSession = true;
    </script>
</body>
</html>
    `;
    
    reply.type('text/html').send(vncHtml);
  }
}

