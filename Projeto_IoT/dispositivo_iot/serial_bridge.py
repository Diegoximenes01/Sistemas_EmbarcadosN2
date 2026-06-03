import time
import json
import sys

# Script de ponte Serial -> HTTP para o Projeto Arcanjos
# Requisitos: pip install pyserial requests

try:
    import serial
    import requests
except ImportError:
    print("\n❌ Erro: Bibliotecas necessarias nao encontradas.")
    print("Por favor, execute o seguinte comando no terminal para instalar:")
    print("👉 pip install pyserial requests\n")
    sys.exit(1)

# Endereco padrao do servidor Express local
SERVER_URL = "http://localhost:3000/api/device/data"

def list_ports():
    import serial.tools.list_ports
    ports = list(serial.tools.list_ports.comports())
    return [p.device for p in ports]

def main():
    print("==================================================")
    print("🛡️  Ponte Serial -> Plataforma IoT - Arcanjos  🛡️")
    print("==================================================")
    
    ports = list_ports()
    if not ports:
        print("⚠️ Nenhuma porta COM detectada. Certifique-se de que o Arduino esta conectado.")
        port_input = input("Digite a porta manualmente (ex: COM3) ou aperte Enter para sair: ").strip()
        if not port_input:
            return
        port = port_input
    else:
        print("Portas seriais disponiveis:")
        for idx, p in enumerate(ports):
            print(f"[{idx}] {p}")
        
        try:
            choice = input(f"Selecione o numero da porta (0-{len(ports)-1}) [Padrão 0]: ").strip()
            if not choice:
                port = ports[0]
            else:
                port = ports[int(choice)]
        except (ValueError, IndexError):
            print("Selecao invalida. Usando a primeira porta.")
            port = ports[0]

    baud = 9600
    print(f"\nConectando em {port} a {baud} bps...")
    
    try:
        ser = serial.Serial(port, baud, timeout=1)
        # Limpa o buffer de entrada
        ser.flushInput()
        time.sleep(2) # Aguarda inicializacao do Arduino
        print("✅ Conexao Serial estabelecida com sucesso!")
        print("Monitorando a porta serial. Pressione Ctrl+C para encerrar.\n")
    except Exception as e:
        print(f"❌ Erro ao abrir a porta {port}: {e}")
        return

    while True:
        try:
            if ser.in_waiting > 0:
                # Le a linha enviada pelo Arduino
                line = ser.readline().decode('utf-8', errors='replace').strip()
                if not line:
                    continue
                
                # Exibe a linha lida no console para debug
                print(f"[SERIAL] -> {line}")
                
                # Tenta parsear como JSON
                try:
                    data = json.loads(line)
                    # Verifica campos necessarios
                    if "smoke" in data:
                        # Repassa para o servidor HTTP local
                        response = requests.post(SERVER_URL, json=data, timeout=3)
                        if response.status_code == 200:
                            print(f"   📡 HTTP OK: Dados enviados -> Fumaça: {data['smoke']} PPM | Alerta: {data.get('alertaAtivo')}")
                        else:
                            print(f"   ❌ HTTP Erro {response.status_code}: {response.text}")
                except json.JSONDecodeError:
                    # Nao era um JSON valido, apenas exibe a linha do Arduino
                    pass
                
            time.sleep(0.1)
            
        except KeyboardInterrupt:
            print("\nEncerrando ponte serial...")
            ser.close()
            break
        except Exception as e:
            print(f"❌ Erro inesperado: {e}")
            time.sleep(2)

if __name__ == "__main__":
    main()
