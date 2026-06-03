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
const char* ssid = "NOME_DA_SUA_REDE_WIFI";
const char* password = "SENHA_DO_SEU_WIFI";

// Endereço IP do seu computador rodando o servidor Express (porta 3000)
// Exemplo: "http://192.168.1.100:3000/api/device/data"
const char* serverEndpoint = "http://ENDERECO_IP_DO_COMPUTADOR:3000/api/device/data";

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

// Envia a requisição HTTP POST com payload JSON
void enviarDadosServidor(int valorFumaca, bool estadoAlerta) {
  HTTPClient http;
  
  // Inicia conexão com o endpoint
  http.begin(serverEndpoint);
  http.addHeader("Content-Type", "application/json");
  
  // Monta o payload JSON
  // Exemplo: {"smoke": 45, "alertaAtivo": false}
  String jsonPayload = "{\"smoke\":" + String(valorFumaca) + 
                       ",\"alertaAtivo\":" + (estadoAlerta ? "true" : "false") + "}";
  
  Serial.print("Enviando para plataforma: ");
  Serial.println(jsonPayload);
  
  // Envia a requisição POST
  int httpResponseCode = http.POST(jsonPayload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("Resposta do Servidor (");
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
