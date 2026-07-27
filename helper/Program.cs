using System.Diagnostics;
using System.IO.Compression;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Runtime.InteropServices;
using Microsoft.Data.Sqlite;

const int ProtocolVersion = 1;
const int MaxFrameBytes = 1024 * 1024;

var options = HostOptions.Parse(args);
var service = new SnapshotService();
while (true)
{
    await using var pipe = new NamedPipeServerStream(options.PipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte,
        PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
    await pipe.WaitForConnectionAsync();
    try
    {
        if (!ClientIsExpectedGame(pipe, options.GamePid, options.GameExe))
        {
            pipe.Disconnect();
            continue;
        }

        var request = await ReadFrame(pipe);
        var response = await Dispatch(request, options, service);
        await WriteFrame(pipe, response.ToJsonString());
    }
    catch (Exception exception)
    {
        try { await WriteFrame(pipe, JsonSerializer.Serialize(new { ok = false, error = exception.Message })); } catch { }
    }
}

static async Task<JsonObject> Dispatch(JsonObject request, HostOptions options, SnapshotService service)
{
    if (request["version"]?.GetValue<int>() != ProtocolVersion ||
        !FixedTimeEquals(request["secret"]?.GetValue<string>(), options.Secret) ||
        request["gameBuild"]?.GetValue<string>() is not { Length: > 0 } gameBuild)
        return Error("unauthorized or invalid protocol");

    var payload = request["payload"] as JsonObject ?? [];
    return request["command"]?.GetValue<string>() switch
    {
        "health" => new JsonObject { ["ok"] = true, ["protocolVersion"] = ProtocolVersion, ["pid"] = Environment.ProcessId },
        "snapshot" => await service.Create(payload, gameBuild),
        _ => Error("unsupported command")
    };
}

static bool FixedTimeEquals(string? candidate, string expected) => candidate is not null &&
    CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(candidate), Encoding.UTF8.GetBytes(expected));

static JsonObject Error(string message) => new() { ["ok"] = false, ["error"] = message };

static async Task<JsonObject> ReadFrame(Stream stream)
{
    var header = new byte[4];
    await stream.ReadExactlyAsync(header);
    var length = BitConverter.ToInt32(header);
    if (length is < 2 or > MaxFrameBytes) throw new InvalidDataException("invalid frame length");
    var data = new byte[length];
    await stream.ReadExactlyAsync(data);
    return JsonNode.Parse(data) as JsonObject ?? throw new InvalidDataException("request must be a JSON object");
}

static async Task WriteFrame(Stream stream, string json)
{
    var data = Encoding.UTF8.GetBytes(json);
    if (data.Length > MaxFrameBytes) throw new InvalidDataException("response too large");
    await stream.WriteAsync(BitConverter.GetBytes(data.Length));
    await stream.WriteAsync(data);
    await stream.FlushAsync();
}

static bool ClientIsExpectedGame(NamedPipeServerStream pipe, int expectedPid, string expectedExe)
{
    if (!GetNamedPipeClientProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out var pid) || pid != expectedPid) return false;
    try
    {
        using var process = Process.GetProcessById(checked((int)pid));
        var actual = Path.GetFullPath(process.MainModule?.FileName ?? "");
        return string.Equals(actual, expectedExe, StringComparison.OrdinalIgnoreCase);
    }
    catch { return false; }
}

[DllImport("kernel32.dll", SetLastError = true)]
static extern bool GetNamedPipeClientProcessId(IntPtr pipe, out uint clientProcessId);

sealed record HostOptions(string PipeName, string Secret, int GamePid, string GameExe)
{
    public static HostOptions Parse(string[] args)
    {
        var values = args.Chunk(2).Where(x => x.Length == 2 && x[0].StartsWith("--"))
            .ToDictionary(x => x[0][2..], x => x[1], StringComparer.Ordinal);
        if (!values.TryGetValue("pipe-name", out var pipeName) || !values.TryGetValue("secret", out var secret) ||
            !values.TryGetValue("game-pid", out var pidText) || !int.TryParse(pidText, out var gamePid) ||
            !values.TryGetValue("game-exe", out var gameExe) || !Path.IsPathFullyQualified(gameExe))
            throw new ArgumentException("Required: --pipe-name --secret --game-pid --game-exe");
        if (secret.Length < 32 || pipeName.Length is < 8 or > 200) throw new ArgumentException("invalid pipe name or secret");
        return new HostOptions(pipeName, secret, gamePid, Path.GetFullPath(gameExe));
    }
}

sealed class SnapshotService
{
    public async Task<JsonObject> Create(JsonObject payload, string gameBuild)
    {
        var worldId = Required(payload, "worldId");
        var source = Path.GetFullPath(Required(payload, "localSavePath"));
        var output = Path.GetFullPath(Required(payload, "outputDirectory"));
        var sequence = payload["sequence"]?.GetValue<long>() ?? throw new InvalidDataException("sequence required");
        var steamId = Required(payload, "sourceSteamId");
        if (!File.Exists(source) || sequence < 1) throw new InvalidDataException("missing source or invalid sequence");

        Directory.CreateDirectory(output);
        var baseName = $"snapshot-{sequence:D6}";
        var archivePath = Path.Combine(output, baseName + ".db.zip");
        var metadataPath = Path.Combine(output, baseName + ".json");
        if (File.Exists(archivePath) || File.Exists(metadataPath)) throw new IOException("snapshot sequence already exists");

        var workingCopy = Path.Combine(Path.GetTempPath(), $"shared-save-{Guid.NewGuid():N}.db");
        try
        {
            await using (var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.Read))
            await using (var target = new FileStream(workingCopy, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                await input.CopyToAsync(target);
            ValidateSqlite(workingCopy);
            var hash = await HashFile(workingCopy);
            var bytes = new FileInfo(workingCopy).Length;
            using (var archive = ZipFile.Open(archivePath, ZipArchiveMode.Create))
                archive.CreateEntryFromFile(workingCopy, "save.db", CompressionLevel.Optimal);
            var metadata = new JsonObject
            {
                ["worldId"] = worldId, ["sequence"] = sequence, ["createdAtUtc"] = DateTimeOffset.UtcNow.ToString("O"),
                ["sourceSteamId"] = steamId, ["sha256"] = hash, ["uncompressedBytes"] = bytes,
                ["gameBuild"] = gameBuild, ["reason"] = payload["reason"]?.GetValue<string>() ?? "manual"
            };
            await File.WriteAllTextAsync(metadataPath, metadata.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            PruneLocal(output, 10);
            return new JsonObject { ["ok"] = true, ["archivePath"] = archivePath, ["metadataPath"] = metadataPath, ["snapshot"] = metadata };
        }
        catch
        {
            File.Delete(archivePath); File.Delete(metadataPath);
            throw;
        }
        finally { File.Delete(workingCopy); }
    }

    private static string Required(JsonObject payload, string name) => payload[name]?.GetValue<string>() is { Length: > 0 } value ? value : throw new InvalidDataException($"{name} required");

    private static void ValidateSqlite(string path)
    {
        var builder = new SqliteConnectionStringBuilder { DataSource = path, Mode = SqliteOpenMode.ReadOnly };
        using var connection = new SqliteConnection(builder.ConnectionString);
        connection.Open();
        using var command = connection.CreateCommand(); command.CommandText = "PRAGMA integrity_check;";
        if (!string.Equals(command.ExecuteScalar()?.ToString(), "ok", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("SQLite integrity_check failed");
    }

    private static async Task<string> HashFile(string path)
    {
        await using var file = File.OpenRead(path);
        return Convert.ToHexString(await SHA256.HashDataAsync(file)).ToLowerInvariant();
    }

    private static void PruneLocal(string directory, int keep)
    {
        var archives = new DirectoryInfo(directory).GetFiles("snapshot-*.db.zip").OrderByDescending(x => x.Name).Skip(keep);
        foreach (var archive in archives) { var metadata = Path.ChangeExtension(Path.ChangeExtension(archive.FullName, null), ".json"); archive.Delete(); File.Delete(metadata); }
    }
}
