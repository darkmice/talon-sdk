package io.talon;

import com.sun.jna.Library;
import com.sun.jna.Native;
import com.sun.jna.Pointer;
import com.sun.jna.ptr.PointerByReference;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;

/**
 * Talon C ABI 原生函数绑定（JNA）。
 */
interface NativeLib extends Library {

    NativeLib INSTANCE = loadNative();

    static NativeLib loadNative() {
        // 1. 环境变量
        String envPath = System.getenv("TALON_LIB_PATH");
        if (envPath != null && new File(envPath).isFile()) {
            return Native.load(envPath, NativeLib.class);
        }

        // 2. classpath resources (Maven/Gradle JAR 内嵌)
        String fromResource = extractFromResources();
        if (fromResource != null) {
            return Native.load(fromResource, NativeLib.class);
        }

        // 3. SDK 内嵌库: talon-sdk/lib/{platform}/
        String bundled = findBundledLib();
        if (bundled != null) {
            return Native.load(bundled, NativeLib.class);
        }

        // 4. 系统搜索路径
        return Native.load("talon", NativeLib.class);
    }

    /**
     * 从 JAR classpath resources 中提取 native lib 到临时目录。
     * 资源路径: native/{os}/{arch}/{libName}
     */
    static String extractFromResources() {
        String os = System.getProperty("os.name", "").toLowerCase();
        String arch = System.getProperty("os.arch", "");

        String osDir, archDir, libName;
        if (os.contains("mac") || os.contains("darwin")) {
            osDir = "darwin";
            archDir = (arch.contains("aarch64") || arch.contains("arm64")) ? "arm64" : "amd64";
            libName = "libtalon.dylib";
        } else if (os.contains("win")) {
            osDir = "windows";
            archDir = "amd64";
            libName = "talon.dll";
        } else {
            osDir = "linux";
            if (arch.contains("aarch64") || arch.contains("arm64")) archDir = "arm64";
            else if (arch.contains("loongarch64")) archDir = "loongarch64";
            else if (arch.contains("riscv64")) archDir = "riscv64";
            else archDir = "amd64";
            libName = "libtalon.so";
        }

        String resourcePath = "native/" + osDir + "/" + archDir + "/" + libName;
        try (InputStream in = NativeLib.class.getClassLoader().getResourceAsStream(resourcePath)) {
            if (in == null) return null;

            File tmpDir = new File(System.getProperty("java.io.tmpdir"), "talon-native");
            tmpDir.mkdirs();
            File tmpLib = new File(tmpDir, libName);
            if (tmpLib.exists() && tmpLib.length() > 0) {
                return tmpLib.getAbsolutePath();
            }
            // Write to temp file first, then atomic rename to avoid partial reads
            File tmpFile = File.createTempFile("talon-", ".tmp", tmpDir);
            try (FileOutputStream out = new FileOutputStream(tmpFile)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            if (!tmpFile.renameTo(tmpLib)) {
                // Another process may have written it; that's fine
                tmpFile.delete();
            }
            return tmpLib.getAbsolutePath();
        } catch (IOException e) {
            return null;
        }
    }

    static String findBundledLib() {
        String os = System.getProperty("os.name", "").toLowerCase();
        String arch = System.getProperty("os.arch", "");

        String platDir;
        String libName;
        if (os.contains("mac") || os.contains("darwin")) {
            String a = arch.contains("aarch64") || arch.contains("arm64") ? "arm64" : "amd64";
            platDir = "darwin_" + a;
            libName = "libtalon.dylib";
        } else if (os.contains("win")) {
            platDir = "windows_amd64";
            libName = "talon.dll";
        } else {
            String a;
            if (arch.contains("aarch64") || arch.contains("arm64")) a = "arm64";
            else if (arch.contains("loongarch64")) a = "loongarch64";
            else if (arch.contains("riscv64")) a = "riscv64";
            else a = "amd64";
            platDir = "linux_" + a;
            libName = "libtalon.so";
        }

        // 1. TALON_SDK_ROOT 环境变量
        String sdkRootEnv = System.getenv("TALON_SDK_ROOT");
        if (sdkRootEnv != null) {
            File lib = new File(sdkRootEnv, "lib/" + platDir + "/" + libName);
            if (lib.isFile()) return lib.getAbsolutePath();
        }

        // 2. 相对于 jar 位置向上查找 lib/ 目录
        try {
            String classPath = NativeLib.class.getProtectionDomain()
                    .getCodeSource().getLocation().getPath();
            File dir = new File(classPath).getParentFile();
            for (int i = 0; i < 6 && dir != null; i++) {
                File lib = new File(dir, "lib/" + platDir + "/" + libName);
                if (lib.isFile()) return lib.getAbsolutePath();
                dir = dir.getParentFile();
            }
        } catch (Exception ignored) {}
        return null;
    }

    Pointer talon_open(String path);

    void talon_close(Pointer handle);

    int talon_execute(Pointer handle, String cmdJson,
                      PointerByReference outJson);

    void talon_free_string(Pointer ptr);

    int talon_persist(Pointer handle);
}
