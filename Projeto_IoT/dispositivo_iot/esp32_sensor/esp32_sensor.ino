/**
 * 🛡️ Arcanjos - Código IoT para ESP32 / ESP8266
 * 
 * Este código conecta o microcontrolador ESP32 à sua rede WiFi local
 * e envia as leituras analógicas do sensor de fumaça diretamente
 * para o servidor da plataforma IoT Arcanjos via requisições HTTP POST.
 * 
 * Componentes necessários no ESP32:
 * - Sensor de Gás/Fumaça (Pino Analógico 34)
 * - LED Verde (Pino 2)
 * - LED Vermelho (Pino 4)
 * - Buzzer (Pino 5)
 */

#include <WiFi.h>
#include <HTTPClient.h>

// ==========================================
// CONFIGURAÇÕES DO WIFI E SERVIDOR
// ==========================================
// Configuração para rodar no Wokwi (simulador WiFi gratuito do Wokwi)
const char* ssid = "Wokwi-GUEST";
const char* password = "";

// Configurações para hardware real (se necessário):
// const char* ssid = "NOVA ROMA_ALUNOS";
// const char* password = "Alunos@2025";

// Token de Autorização do Dispositivo TagoIO
const char* tagoToken = "1590acd8-26a1-41b8-a5cb-da6f022c5872";

// Configurado para enviar os dados diretamente para a nuvem da TagoIO
const char* serverEndpoint = "https://api.tago.io/data";

// ==========================================
// DEFINIÇÃO DOS PINOS
// ==========================================
const int sensorPin = 34;      // Pino analógico do sensor de gás no ESP32 (ex: GPIO34)
const int ledVerde = 2;        // LED Verde indicador de segurança (GPIO2 / Onboard LED)
const int ledVermelho = 4;     // LED Vermelho indicador de alerta (GPIO4)
const int buzzer = 5;          // Buzzer indicador de som (GPIO5)

// ==========================================
// CONFIGURAÇÕES DO SENSOR (HISTERESE)
// ==========================================
const int limiteAlerta = 55;
const int limiteNormal = 40;
bool alertaAtivo = false;

// Intervalo de tempo entre envios (em milissegundos)
const unsigned long intervaloEnvio = 2000; 
unsigned long tempoAnterior = 0;

void setup() {
  Serial.begin(115200);
  
  // Configuração dos pinos
  pinMode(sensorPin, INPUT);
  pinMode(ledVerde, OUTPUT);
  pinMode(ledVermelho, OUTPUT);
  pinMode(buzzer, OUTPUT);

  // Inicializa LEDs
  digitalWrite(ledVerde, HIGH);
  digitalWrite(ledVermelho, LOW);

  // Conexão WiFi
  Serial.println();
  Serial.print("Conectando-se ao WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    // Pisca LED vermelho enquanto tenta conectar
    digitalWrite(ledVermelho, !digitalRead(ledVermelho));
  }
  
  digitalWrite(ledVermelho, LOW);
  digitalWrite(ledVerde, HIGH);
  
  Serial.println("");
  Serial.println("WiFi Conectado!");
  Serial.print("Endereço IP obtido: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // Lê o valor analógico do sensor (0 a 4095 no ESP32)
  // Mapeamos para uma escala de 0 a 100 para corresponder ao código original
  int rawValue = analogRead(sensorPin);
  int smoke = map(rawValue, 0, 4095, 0, 100);

  // Exibe leitura no monitor serial local
  Serial.print("Sensor (Raw): ");
  Serial.print(rawValue);
  Serial.print(" | Fumaça (Mapeado): ");
  Serial.println(smoke);

  // Lógica de Histerese de Alerta
  if (!alertaAtivo && smoke >= limiteAlerta) {
    alertaAtivo = true;
    Serial.println("🚨 ESTADO DE ALERTA ATIVADO!");
  } else if (alertaAtivo && smoke <= limiteNormal) {
    alertaAtivo = false;
    noTone(buzzer);
    Serial.println("🟢 RETORNO AO ESTADO SEGURO.");
  }

  // Ações nos atuadores locais (LEDs e Buzzer)
  if (alertaAtivo) {
    digitalWrite(ledVermelho, HIGH);
    digitalWrite(ledVerde, LOW);
    
    // Toca Buzzer (Som alternado)
    tone(buzzer, 600);
    delay(100);
    tone(buzzer, 850);
    delay(100);
  } else {
    digitalWrite(ledVermelho, LOW);
    digitalWrite(ledVerde, HIGH);
    noTone(buzzer);
  }

  // Envia dados para o servidor de tempos em tempos
  unsigned long tempoAtual = millis();
  if (tempoAtual - tempoAnterior >= intervaloEnvio) {
    tempoAnterior = tempoAtual;
    
    if (WiFi.status() == WL_CONNECTED) {
      enviarDadosServidor(smoke, alertaAtivo);
    } else {
      Serial.println("❌ WiFi desconectado. Não foi possível enviar os dados.");
    }
  }
}

// Envia a requisição HTTP POST com payload JSON (compatível com TagoIO e servidor local)
void enviarDadosServidor(int valorFumaca, bool estadoAlerta) {
  HTTPClient http;
  
  // Inicia conexão com o endpoint
  http.begin(serverEndpoint);
  http.addHeader("Content-Type", "application/json");
  
  // Se o endpoint for da TagoIO, adiciona o cabeçalho Authorization
  if (String(serverEndpoint).indexOf("tago.io") != -1) {
    http.addHeader("Authorization", tagoToken);
  }
  
  // Monta o payload de acordo com a plataforma de destino
  String jsonPayload;
  if (String(serverEndpoint).indexOf("tago.io") != -1) {
    // Padrão exigido pela TagoIO: [{"variable": "nome", "value": valor}, ...]
    jsonPayload = "[";
    jsonPayload += "{\"variable\":\"smoke\",\"value\":" + String(valorFumaca) + "},";
    jsonPayload += "{\"variable\":\"alertaAtivo\",\"value\":" + String(estadoAlerta ? 1 : 0) + "}";
    jsonPayload += "]";
  } else {
    // Padrão do seu Servidor Express Local
    jsonPayload = "{\"smoke\":" + String(valorFumaca) + 
                  ",\"alertaAtivo\":" + (estadoAlerta ? "true" : "false") + "}";
  }
  
  Serial.print("Enviando dados: ");
  Serial.println(jsonPayload);
  
  // Envia a requisição POST
  int httpResponseCode = http.POST(jsonPayload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("Resposta (");
    Serial.print(httpResponseCode);
    Serial.print("): ");
    Serial.println(response);
  } else {
    Serial.print("❌ Erro no envio HTTP POST: ");
    Serial.println(httpResponseCode);
  }
  
  // Fecha conexão
  http.end();
}
