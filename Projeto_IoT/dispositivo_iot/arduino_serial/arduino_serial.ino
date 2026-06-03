// Biblioteca para controle do display LCD
#include <LiquidCrystal.h>

// Configuração dos pinos do LCD (RS, E, D4, D5, D6, D7)
LiquidCrystal lcd(13, 12, 11, 10, 9, 8);

// =====================
// Definição dos pinos
// =====================
const int sensorPin = A5;      // Sensor de fumaça ligado na porta analógica A5
const int ledVerde = 7;        // LED verde (indica ambiente seguro)
const int ledVermelho = 6;     // LED vermelho (indica alerta)
const int buzzer = 5;          // Buzzer (alarme sonoro)

// =====================
// Definição dos limites
// =====================
const int limiteAlerta = 55;   // Valor mínimo para entrar em estado de alerta
const int limiteNormal = 40;   // Valor para sair do estado de alerta (histerese)

// =====================
// Variáveis de controle
// =====================
int smoke = 0;                // Armazena o valor lido do sensor
bool alertaAtivo = false;     // Indica se o sistema está em alerta ou não

// Tempo de controle para envio de dados periódicos
unsigned long tempoAnterior = 0;
const unsigned long intervaloEnvio = 1500; // Envia a cada 1.5 segundos

// =====================
// Função de inicialização
// =====================
void setup()
{
  pinMode(sensorPin, INPUT);       // Define o sensor como entrada
  pinMode(ledVerde, OUTPUT);       // LED verde como saída
  pinMode(ledVermelho, OUTPUT);    // LED vermelho como saída
  pinMode(buzzer, OUTPUT);         // Buzzer como saída

  Serial.begin(9600);              // Inicia comunicação serial (velocidade padrão do Arduino Uno)
  lcd.begin(16, 2);                // Inicializa LCD 16x2

  // Mensagem inicial do sistema
  lcd.setCursor(0, 0);
  lcd.print("SISTEMA LIGANDO");
  lcd.setCursor(0, 1);
  lcd.print("MONITORANDO...");
  delay(2000); // Aguarda 2 segundos

  mostrarNormal(); // Mostra estado inicial seguro
}

// =====================
// Função: Ambiente normal
// =====================
void mostrarNormal()
{
  lcd.clear();                    // Limpa o LCD
  lcd.setCursor(0, 0);
  lcd.print("AMBIENTE SEGURO");   // Linha 1
  lcd.setCursor(0, 1);
  lcd.print("SEM FUMACA");        // Linha 2
}

// =====================
// Função: Estado de alerta
// =====================
void mostrarAlerta()
{
  lcd.clear();                    // Limpa o LCD
  lcd.setCursor(0, 0);
  lcd.print("!!! ALERTA !!!");    // Linha 1
  lcd.setCursor(0, 1);
  lcd.print("FUMACA DETECTADA."); // Linha 2
}

// =====================
// Função: Sirene (som alternado)
// =====================
void sireneSuave()
{
  tone(buzzer, 500); // Emite som de 500 Hz
  delay(100);
  tone(buzzer, 800); // Emite som de 800 Hz
  delay(100);
}

// =====================
// Loop principal
// =====================
void loop()
{
  // Lê o valor do sensor de fumaça (0 a 1023 no Arduino Uno)
  // Mapeamos para uma escala de 0 a 100 para corresponder ao comportamento esperado
  int leituraRaw = analogRead(sensorPin);
  smoke = map(leituraRaw, 0, 1023, 0, 100);

  // =====================
  // Ativa o ALERTA
  // =====================
  if (!alertaAtivo && smoke >= limiteAlerta)
  {
    alertaAtivo = true;  // Liga o estado de alerta
    mostrarAlerta();     // Atualiza o LCD
  }

  // =====================
  // Desativa o ALERTA
  // =====================
  if (alertaAtivo && smoke <= limiteNormal)
  {
    alertaAtivo = false; // Desliga o alerta
    noTone(buzzer);      // Para o som
    mostrarNormal();     // Volta para estado normal
  }

  // =====================
  // Ações conforme estado
  // =====================
  if (alertaAtivo)
  {
    digitalWrite(ledVermelho, HIGH); // Liga LED vermelho
    digitalWrite(ledVerde, LOW);     // Desliga LED verde
    sireneSuave();                   // Ativa sirene
  }
  else
  {
    digitalWrite(ledVermelho, LOW);  // Desliga LED vermelho
    digitalWrite(ledVerde, HIGH);    // Liga LED verde
    noTone(buzzer);                  // Garante buzzer desligado
    delay(50);                       // Pequeno atraso
  }

  // ==========================================
  // ENVIO DE DADOS FORMATADOS EM JSON VIA SERIAL
  // ==========================================
  // Envia no formato: {"smoke": 42, "alertaAtivo": false}
  // Isso permite que o script em Python (serial_bridge.py)
  // capture a linha do Serial Monitor e repasse para o servidor.
  unsigned long tempoAtual = millis();
  if (tempoAtual - tempoAnterior >= intervaloEnvio) {
    tempoAnterior = tempoAtual;
    
    Serial.print("{\"smoke\":");
    Serial.print(smoke);
    Serial.print(",\"alertaAtivo\":");
    Serial.print(alertaAtivo ? "true" : "false");
    Serial.println("}");
  }
}
