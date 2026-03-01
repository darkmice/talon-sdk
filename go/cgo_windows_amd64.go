//go:build windows && amd64

package talon

/*
#cgo LDFLAGS: -L${SRCDIR}/../lib/windows_amd64 -ltalon
#cgo LDFLAGS: -lws2_32 -lbcrypt -luserenv -lntdll
*/
import "C"
