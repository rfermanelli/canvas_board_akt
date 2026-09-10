FROM node:20-alpine
WORKDIR /app
# LibreOffice headless: converte i .pptx caricati in PDF, così sono sfogliabili in-canvas.
RUN apk add --no-cache libreoffice ttf-dejavu font-noto && mkdir -p /tmp/lo
ENV HOME=/tmp
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p /app/uploads
EXPOSE 4000
CMD ["npm", "start"]
