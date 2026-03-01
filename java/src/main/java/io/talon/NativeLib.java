package io.talon;

import com.sun.jna.Library;
import com.sun.jna.Native;
import com.sun.jna.Pointer;
import com.sun.jna.ptr.PointerByReference;

/**
 * Talon C ABI 原生函数绑定（JNA）。
 */
interface NativeLib extends Library {

    NativeLib INSTANCE = Native.load("talon", NativeLib.class);

    Pointer talon_open(String path);

    void talon_close(Pointer handle);

    int talon_execute(Pointer handle, String cmdJson,
                      PointerByReference outJson);

    void talon_free_string(Pointer ptr);

    int talon_persist(Pointer handle);
}
