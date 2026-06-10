import time
import sys
import random

try:
    import requests
except ImportError:
    print("\n❌ Erro: Biblioteca 'requests' nao encontrada.")
    print("Por favor, instale executando o comando:")
    print("👉 pip install requests\n")
    sys.exit(1)

# Importa modulo para captura de teclado nao bloqueante no Windows
import msvcrt

SERVER_URL = "https://api.tago.io/data"
TAGO_TOKEN = "1590acd8-26a1-41b8-a5cb-da6f022c5872"

# Caso queira usar localmente, descomente a linha abaixo e comente as de cima:
# SERVER_URL = "http://localhost:3000/api/device/data"

def draw_gauge(value, threshold):
    width = 30
    filled = int((value / 100) * width)
    bar = "=" * filled + "-" * (width - filled)
    
    # Define a cor no terminal
    if value >= threshold:
        color_start = "\033[91m" # Vermelho
    elif value >= 40:
        color_start = "\033[93m" # Amarelo
    else:
        color_start = "\033[92m" # Verde
    
    color_end = "\033[0m"
    return f"[{color_start}{bar}{color_end}] {value:3d} PPM"

def main():
    print("==================================================")
    print("[ARCANJOS] Emulador de Dispositivo IoT (Smoke)")
    print("==================================================")
    print("Este script simula o comportamento do Arduino/ESP32.")
    print("Ele gera leituras analogicas de fumaca e envia via HTTP.")
    print("\nControles de Eventos:")
    print("-> Pressione [A] para simular ALERTA DE INCENDIO (Subir fumaca)")
    print("-> Pressione [S] para simular AMBIENTE SEGURO (Dissipar fumaca)")
    print("-> Pressione [Q] para Sair do emulador")
    print("==================================================\n")

    smoke = 20
    target_smoke = 20
    threshold = 55
    
    # Loop de simulacao
    while True:
        # 1. Verifica teclado
        if msvcrt.kbhit():
            key = msvcrt.getch().decode('utf-8', errors='ignore').lower()
            if key == 'a':
                target_smoke = 85
                print("\n[EMULADOR] Comando recebido: Iniciando pico de fumaca...")
            elif key == 's':
                target_smoke = 18
                print("\n[EMULADOR] Comando recebido: Iniciando dissipacao de fumaca...")
            elif key == 'q':
                print("\nEncerrando emulador...")
                break

        # 2. Atualiza valor do sensor gradualmente para simular comportamento real
        if smoke < target_smoke:
            smoke += random.randint(3, 8)
            if smoke > target_smoke: smoke = target_smoke
        elif smoke > target_smoke:
            smoke -= random.randint(2, 6)
            if smoke < target_smoke: smoke = target_smoke
        else:
            # Pequeno ruido quando estavel
            smoke += random.randint(-1, 1)
            # Limita escala entre 0 e 100
            smoke = max(0, min(100, smoke))

        alerta_ativo = smoke >= threshold

        # 3. Desenha no terminal
        sys.stdout.write(f"\rLeitura: {draw_gauge(smoke, threshold)} | Alerta: {'ALERTA' if alerta_ativo else 'SEGURO'} | Alvo: {target_smoke} PPM  ")
        sys.stdout.flush()

        # 4. Envia para o servidor (TagoIO ou Local)
        headers = {"Content-Type": "application/json"}
        
        if "tago.io" in SERVER_URL:
            headers["Authorization"] = TAGO_TOKEN
            payload = [
                {"variable": "smoke", "value": smoke},
                {"variable": "alertaAtivo", "value": 1 if alerta_ativo else 0}
            ]
        else:
            payload = {
                "smoke": smoke,
                "alertaAtivo": alerta_ativo
            }

        try:
            response = requests.post(SERVER_URL, json=payload, headers=headers, timeout=5)
            # Se der certo, mantemos limpo
        except requests.exceptions.RequestException:
            if "tago.io" in SERVER_URL:
                sys.stdout.write("\r[ERRO] Falha ao enviar para o TagoIO. Verifique sua conexao com a internet! ")
            else:
                sys.stdout.write("\r[ERRO] Erro ao se conectar com o servidor local. Verifique se 'node server.js' esta rodando! ")
            sys.stdout.flush()

        # Aguarda 1.5 segundos
        time.sleep(1.5)

if __name__ == "__main__":
    main()
